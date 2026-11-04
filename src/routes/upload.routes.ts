import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { requireAuth } from '../middleware/auth.middleware';

const router = Router();
const UPLOAD_DIR = path.join(__dirname, '../../public/uploads');

// Ensure upload directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

/**
 * POST /api/v1/upload
 * Protected: Requires authenticated user, partner, or admin
 * Handles base64 data URLs or standard image URLs
 */
router.post('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const { image, name } = req.body;

    if (!image || typeof image !== 'string') {
      return res.status(400).json({ success: false, error: 'No image data provided' });
    }

    // If it's already an HTTP / HTTPS URL
    if (image.startsWith('http://') || image.startsWith('https://')) {
      return res.status(200).json({
        success: true,
        url: image,
        message: 'Image URL registered successfully',
      });
    }

    // If it's a base64 data URI
    const match = image.match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/);
    if (match) {
      const rawExt = match[1].toLowerCase();
      const ALLOWED_EXTENSIONS: Record<string, string> = {
        jpeg: 'jpg',
        jpg: 'jpg',
        png: 'png',
        webp: 'webp',
      };

      if (!ALLOWED_EXTENSIONS[rawExt]) {
        return res.status(400).json({
          success: false,
          error: 'Unsupported image type. Only JPEG, PNG, and WebP images are permitted.',
        });
      }

      const ext = ALLOWED_EXTENSIONS[rawExt];
      const base64Data = match[2];

      // Limit upload size (max 10MB buffer)
      const buffer = Buffer.from(base64Data, 'base64');
      if (buffer.length > 10 * 1024 * 1024) {
        return res.status(400).json({ success: false, error: 'Image exceeds maximum 10MB size limit.' });
      }

      const filename = `img_${Date.now()}_${Math.floor(100000 + Math.random() * 900000)}.${ext}`;
      const filePath = path.join(UPLOAD_DIR, filename);

      fs.writeFileSync(filePath, buffer);

      // Construct accessible URL
      const host = req.get('host') || 'api.happylokam.com';
      const protocol = req.protocol === 'https' || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
      const fileUrl = `${protocol}://${host}/uploads/${filename}`;

      return res.status(201).json({
        success: true,
        url: fileUrl,
        relativePath: `/uploads/${filename}`,
        message: 'Image uploaded and processed successfully',
      });
    }

    return res.status(400).json({
      success: false,
      error: 'Invalid image format. Provide a valid HTTP URL or base64 data URL (JPEG, PNG, WebP).',
    });
  } catch (error: any) {
    console.error('Image upload error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Image upload failed' });
  }
});

export default router;
