import type { IncomingMessage } from 'node:http';
import { DomainError } from '../../packages/domain/rental.ts';

export async function readJson(req: IncomingMessage & { body?: unknown }): Promise<unknown> {
  if (req.headers['content-type']?.split(';')[0].trim() !== 'application/json') throw new DomainError('Envie o formulário em JSON.', 415);
  try {
    // Vercel Node helpers have already read the stream and expose a lazy JSON getter.
    if ('body' in req) {
      const body = req.body;
      if (Buffer.byteLength(JSON.stringify(body) ?? '') > 65536) throw new DomainError('O formulário excede o tamanho permitido.', 413);
      return body;
    }
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req) {
      const bytes = Buffer.from(chunk);
      size += bytes.length;
      if (size > 65536) throw new DomainError('O formulário excede o tamanho permitido.', 413);
      chunks.push(bytes);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch (error) {
    if (error instanceof DomainError) throw error;
    throw new DomainError('JSON inválido.', 400);
  }
}
