import { Context } from 'hono';
import { writeFile, access, stat } from 'node:fs/promises';
import { join, extname } from 'node:path';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

export async function handleUploadRequest(c: Context) {
  try {
    const body = await c.req.parseBody();
    const file = body['file'] as File;
    const workingDirectory = c.req.query('workingDirectory');
    
    // Parameter validation
    if (!file) {
      return c.json({ error: 'Missing file parameter' }, 400);
    }
    if (!workingDirectory) {
      return c.json({ error: 'Missing working directory parameter' }, 400);
    }
    
    // File size validation
    if (file.size > MAX_FILE_SIZE) {
      return c.json({ error: 'File size exceeds 10MB limit' }, 400);
    }
    
    // File type validation
    if (!ALLOWED_TYPES.includes(file.type)) {
      return c.json({ error: `Unsupported file type: ${file.type}. Supported: PNG, JPG, GIF, WEBP` }, 400);
    }
    
    // Working directory access check
    try {
      await access(workingDirectory);
    } catch {
      return c.json({ error: 'Working directory does not exist or no permission' }, 400);
    }
    
    // Read file content
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    // Magic bytes validation (prevent file spoofing)
    if (!validateFileMagicBytes(buffer, file.type)) {
      return c.json({ error: 'File type validation failed: file content does not match declared type' }, 400);
    }
    
    // Generate unique filename
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(7);
    const ext = extname(file.name) || getExtensionForMimeType(file.type);
    const filename = `upload-${timestamp}-${random}${ext}`;
    const filepath = join(workingDirectory, filename);
    
    // Write file
    await writeFile(filepath, buffer);
    
    return c.json({
      success: true,
      path: filepath,
      filename,
      size: file.size,
      type: file.type,
    });
  } catch (error) {
    console.error('Upload error:', error);
    return c.json({ error: 'File upload failed, please retry' }, 500);
  }
}

function validateFileMagicBytes(buffer: Buffer, mimeType: string): boolean {
  const magicBytes: Record<string, number[][]> = {
    'image/png': [[0x89, 0x50, 0x4E, 0x47]],
    'image/jpeg': [[0xFF, 0xD8, 0xFF]],
    'image/gif': [[0x47, 0x49, 0x46, 0x38]],
    'image/webp': [[0x52, 0x49, 0x46, 0x46]],
  };
  
  const validHeaders = magicBytes[mimeType];
  if (!validHeaders) return true; // Skip validation for undefined file types
  
  const fileHeader = Array.from(buffer.slice(0, 4));
  return validHeaders.some(header => 
    header.every((byte, i) => fileHeader[i] === byte)
  );
}

function getExtensionForMimeType(mimeType: string): string {
  const map: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp',
  };
  return map[mimeType] || '';
}