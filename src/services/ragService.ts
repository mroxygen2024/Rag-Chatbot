import { GoogleGenAI } from "@google/genai";
import * as pdfjs from 'pdfjs-dist';
import { get, set, update } from 'idb-keyval';
import { chunk } from 'lodash';

// Configure PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

export interface DocumentChunk {
  id: string;
  source: string;
  content: string;
  embedding: number[];
  pageNumber: number;
  metadata: Record<string, any>;
}

export interface SearchResult extends DocumentChunk {
  score: number;
}

export class RAGService {
  private ai: any;
  private model: string = "gemini-3-flash-preview";
  private embeddingModel: string = "gemini-embedding-2-preview";

  constructor(apiKey: string) {
    this.ai = new GoogleGenAI({ apiKey });
  }

  async extractTextFromPdf(file: File): Promise<{ text: string; pages: { text: string; pageNumber: number }[] }> {
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjs.getDocument(arrayBuffer);
    const pdf = await loadingTask.promise;
    let fullText = '';
    const pages = [];

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const pageText = content.items.map((item: any) => item.str).join(' ');
      fullText += pageText + '\n';
      pages.push({ text: pageText, pageNumber: i });
    }

    return { text: fullText, pages };
  }

  async processDocument(file: File, onProgress?: (msg: string) => void) {
    onProgress?.(`Extracting text from ${file.name}...`);
    const { pages } = await this.extractTextFromPdf(file);
    
    onProgress?.(`Chunking document...`);
    const chunks: DocumentChunk[] = [];
    
    for (const page of pages) {
      // Split page text into ~1000 character chunks with overlap
      const words = page.text.split(' ');
      const chunkSize = 200; // words
      const overlap = 50;
      
      for (let i = 0; i < words.length; i += (chunkSize - overlap)) {
        const content = words.slice(i, i + chunkSize).join(' ');
        if (content.trim().length < 50) continue;

        chunks.push({
          id: crypto.randomUUID(),
          source: file.name,
          content,
          pageNumber: page.pageNumber,
          embedding: [],
          metadata: {
            uploadedAt: new Date().toISOString(),
          }
        });
      }
    }

    onProgress?.(`Generating embeddings for ${chunks.length} chunks...`);
    
    // Batch embeddings (max 100 per call for safety)
    const batchSize = 50;
    for (let i = 0; i < chunks.length; i += batchSize) {
      const currentBatch = chunks.slice(i, i + batchSize);
      onProgress?.(`Embedding chunks ${i + 1} to ${Math.min(i + batchSize, chunks.length)}...`);
      
      const responses = await Promise.all(currentBatch.map(c => 
        this.ai.models.embedContent({
          model: this.embeddingModel,
          content: { parts: [{ text: c.content }] }
        })
      ));

      responses.forEach((res, index) => {
        currentBatch[index].embedding = res.embedding.values;
      });
    }

    // Save to IndexedDB
    const existingIndex = await get('rag_index') || [];
    await set('rag_index', [...existingIndex, ...chunks]);
    
    const docMeta = await get('processed_docs') || [];
    await set('processed_docs', [...docMeta, { 
      name: file.name, 
      chunkCount: chunks.length, 
      date: new Date().toISOString() 
    }]);

    onProgress?.(`Document ${file.name} indexed successfully.`);
  }

  async search(query: string, limit: number = 5): Promise<SearchResult[]> {
    const queryEmbeddingRes = await this.ai.models.embedContent({
      model: this.embeddingModel,
      content: { parts: [{ text: query }] }
    });
    const queryEmbedding = queryEmbeddingRes.embedding.values;

    const index: DocumentChunk[] = await get('rag_index') || [];
    
    // Stage 1: Vector Search (Top 10)
    const candidates = index.map(chunk => ({
      ...chunk,
      score: this.cosineSimilarity(queryEmbedding, chunk.embedding)
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

    if (candidates.length === 0) return [];

    // Stage 2: Prompt-based Reranking (optional optimization but for "production" feel)
    // Actually, for speed in browser, we take Top K
    const results = candidates.slice(0, limit);

    return results;
  }

  private cosineSimilarity(vecA: number[], vecB: number[]): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
        normA += vecA[i] * vecA[i];
        normB += vecB[i] * vecB[i];
    }
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  async answer(query: string, context: SearchResult[]): Promise<string> {
    const contextPrompt = context
      .map(c => `[Source: ${c.source}, Page: ${c.pageNumber}]\n${c.content}`)
      .join('\n\n---\n\n');

    const systemPrompt = `You are a specialized financial analyst AI assistant for FinSight. 
Your goal is to answer client questions strictly using the provided document excerpts.

Rules:
1. Only use the provided context. If the answer isn't there, say "I don't have enough information in the internal documents to answer that."
2. Provide specific citations for your claims, e.g., (Source Name, Page X).
3. Be professional, concise, and accurate.
4. If there are data tables, interpret them carefully.
5. Do not hallucinate fund returns or dates.

Context:
${contextPrompt}`;

    const response = await this.ai.models.generateContent({
      model: this.model,
      contents: [{ parts: [{ text: query }] }],
      config: {
        systemInstruction: systemPrompt,
        temperature: 0.2,
      }
    });

    return response.text;
  }

  async clearIndex() {
    await set('rag_index', []);
    await set('processed_docs', []);
  }
}
