import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import slugify from 'slugify';

const prisma = new PrismaClient();

export const createBlog = async (req: Request, res: Response) => {
  try {
    const { title, content, featuredImage, metaTitle, metaDescription, metaKeywords, status } = req.body;
    
    // Auto-generate SEO slug
    const baseSlug = slugify(title, { lower: true, strict: true });
    let slug = baseSlug;
    let counter = 1;
    while (await prisma.blogPost.findUnique({ where: { slug } })) {
      slug = `${baseSlug}-${counter}`;
      counter++;
    }

    const blog = await prisma.blogPost.create({
      data: {
        title, slug, content,
        featuredImage: featuredImage || null,
        metaTitle: metaTitle || title,
        metaDescription: metaDescription || content.substring(0, 160),
        metaKeywords: metaKeywords || null,
        status: status || 'Draft',
        publishedAt: status === 'Published' ? new Date() : null
      }
    });
    res.status(201).json({ success: true, data: blog });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getPublishedBlogs = async (req: Request, res: Response) => {
  try {
    const blogs = await prisma.blogPost.findMany({
      where: { status: 'Published' },
      orderBy: { publishedAt: 'desc' },
      select: { id: true, title: true, slug: true, featuredImage: true, metaDescription: true, author: true, publishedAt: true }
    });
    res.status(200).json({ success: true, data: blogs });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getAllBlogs = async (req: Request, res: Response) => {
  try {
    const blogs = await prisma.blogPost.findMany({ orderBy: { createdAt: 'desc' } });
    res.status(200).json({ success: true, data: blogs });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getBlogBySlug = async (req: Request, res: Response) => {
  try {
    const blog = await prisma.blogPost.findUnique({ where: { slug: req.params.slug as string } });
    if (!blog) return res.status(404).json({ success: false, error: 'Blog not found.' });
    res.status(200).json({ success: true, data: blog });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const updateBlog = async (req: Request, res: Response) => {
  try {
    const data: any = { ...req.body };
    delete data.id;
    delete data.createdAt;
    delete data.updatedAt;

    const blog = await prisma.blogPost.update({ where: { id: req.params.id as string }, data });
    res.status(200).json({ success: true, data: blog });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const publishBlog = async (req: Request, res: Response) => {
  try {
    const blog = await prisma.blogPost.update({
      where: { id: req.params.id as string },
      data: { status: 'Published', publishedAt: new Date() }
    });
    res.status(200).json({ success: true, data: blog });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const deleteBlog = async (req: Request, res: Response) => {
  try {
    await prisma.blogPost.delete({ where: { id: req.params.id as string } });
    res.status(200).json({ success: true, message: 'Blog deleted.' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};
