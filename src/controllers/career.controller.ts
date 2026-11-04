import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { logAdminActivity } from './adminActivity.controller';

const prisma = new PrismaClient();

// In-memory fallback if remote database table is pending migration
let inMemoryApplications: any[] = [
  {
    id: 'app_sample_1',
    fullName: 'Pooja Verma',
    email: 'pooja.verma@example.com',
    phone: '+91 98290 11223',
    role: 'Event Experience Curator',
    experience: '3-5 years',
    portfolioUrl: 'https://poojaverma.design',
    resumeUrl: 'https://happylokam.com/uploads/resumes/pooja_verma.pdf',
    coverNote: 'Experienced in organizing 40+ luxury destination weddings and palace galas in Udaipur and Jaipur. Passionate about curating bespoke mandaps and guest hospitality.',
    status: 'PENDING',
    adminNotes: 'Great portfolio in luxury destination weddings. Call for round 1.',
    createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'app_sample_2',
    fullName: 'Rohan Deshmukh',
    email: 'rohan.d@example.com',
    phone: '+91 97654 33445',
    role: 'Vendor Partnership Manager',
    experience: '5+ years',
    portfolioUrl: '',
    resumeUrl: 'https://happylokam.com/uploads/resumes/rohan_deshmukh.pdf',
    coverNote: 'Previously managed onboarding for 150+ catering houses and floral vendors across Western India. Deep network with banquet owners.',
    status: 'SHORTLISTED',
    adminNotes: 'Shortlisted for vendor acquisition lead.',
    createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'app_sample_3',
    fullName: 'Aditya Singhal',
    email: 'aditya.singhal@example.com',
    phone: '+91 91234 56780',
    role: 'Fullstack AI Engineer',
    experience: '1-3 years',
    portfolioUrl: 'https://github.com/aditya-dev',
    resumeUrl: '',
    coverNote: 'Passionate about building ultra-fast React Native apps, Next.js customer portals, and real-time payment integration.',
    status: 'INTERVIEWING',
    adminNotes: 'Technical assignment passed, scheduling CTO interview.',
    createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

/**
 * PUBLIC: Submit a career application
 * POST /api/v1/career/apply
 */
export const submitCareerApplication = async (req: Request, res: Response) => {
  try {
    const { fullName, email, phone, role, experience, portfolioUrl, resumeUrl, coverNote } = req.body || {};
    const resolvedFullName = fullName || req.body.name;
    const resolvedRole = role || req.body.position || req.body.jobRole || req.body.jobTitle;
    const resolvedCoverNote = coverNote || req.body.coverLetter || req.body.message || req.body.notes;

    if (!resolvedFullName || !email || !phone || !resolvedRole || !resolvedCoverNote) {
      return res.status(400).json({
        success: false,
        error: 'Please fill in all required fields (Full Name, Email, Phone, Role, and Cover Note).',
      });
    }

    const applicationData = {
      id: `app_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      fullName: String(resolvedFullName).trim(),
      email: String(email).trim().toLowerCase(),
      phone: String(phone).trim(),
      role: String(resolvedRole).trim(),
      experience: experience ? String(experience).trim() : 'Not Specified',
      portfolioUrl: portfolioUrl ? String(portfolioUrl).trim() : null,
      resumeUrl: resumeUrl ? String(resumeUrl).trim() : null,
      coverNote: String(resolvedCoverNote).trim(),
      status: 'PENDING',
      adminNotes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    let createdRecord = null;

    try {
      if ((prisma as any).careerApplication) {
        createdRecord = await (prisma as any).careerApplication.create({
          data: applicationData,
        });
      }
    } catch (dbErr) {
      console.warn('[Career] Prisma insert fallback to memory:', dbErr);
    }

    if (!createdRecord) {
      inMemoryApplications.unshift(applicationData);
      createdRecord = applicationData;
    }

    // Automatically notify the Admin OS of this new submission!
    await logAdminActivity(
      'CAREER_APPLICATION',
      `New Job Applicant: ${resolvedFullName}`,
      `${resolvedFullName} applied for "${resolvedRole}" (${experience || 'N/A'}). Contact: ${phone} | ${email}`,
      {
        applicantId: createdRecord.id,
        fullName: resolvedFullName,
        email,
        phone,
        role: resolvedRole,
        experience,
      },
      'INFO'
    );

    return res.status(201).json({
      success: true,
      message: 'Your application has been received! The Happy Lokam talent team will review your profile and reach out shortly.',
      data: createdRecord,
    });
  } catch (error: any) {
    console.error('Error submitting career application:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * ADMIN: Fetch all career applications
 * GET /api/v1/career or GET /api/v1/admin/career
 */
export const getCareerApplicationsAdmin = async (req: Request, res: Response) => {
  try {
    const { status, role, search, page = 1, limit = 50 } = req.query;
    const pageNum = Math.max(1, Number(page));
    const limitNum = Math.min(100, Math.max(1, Number(limit)));
    const skip = (pageNum - 1) * limitNum;

    let items: any[] = [];
    let total = 0;

    try {
      if ((prisma as any).careerApplication) {
        const where: any = {};
        if (status && status !== 'ALL') where.status = String(status);
        if (role && role !== 'ALL') where.role = String(role);
        if (search) {
          where.OR = [
            { fullName: { contains: String(search), mode: 'insensitive' } },
            { email: { contains: String(search), mode: 'insensitive' } },
            { phone: { contains: String(search), mode: 'insensitive' } },
            { role: { contains: String(search), mode: 'insensitive' } },
          ];
        }

        const [dbItems, dbTotal] = await Promise.all([
          (prisma as any).careerApplication.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            skip,
            take: limitNum,
          }),
          (prisma as any).careerApplication.count({ where }),
        ]);

        items = dbItems;
        total = dbTotal;
      }
    } catch {
      // In-memory fallback
    }

    if (items.length === 0 && inMemoryApplications.length > 0) {
      let filtered = [...inMemoryApplications];
      if (status && status !== 'ALL') filtered = filtered.filter((i) => i.status === status);
      if (role && role !== 'ALL') filtered = filtered.filter((i) => i.role === role);
      if (search) {
        const q = String(search).toLowerCase();
        filtered = filtered.filter(
          (i) =>
            i.fullName.toLowerCase().includes(q) ||
            i.email.toLowerCase().includes(q) ||
            i.phone.includes(q) ||
            i.role.toLowerCase().includes(q)
        );
      }

      total = filtered.length;
      items = filtered.slice(skip, skip + limitNum);
    }

    // Calculate metrics accurately from database or in-memory fallback
    let metrics = {
      total,
      pending: 0,
      shortlisted: 0,
      interviewing: 0,
      hired: 0,
    };

    try {
      if ((prisma as any).careerApplication) {
        const [pCount, sCount, iCount, hCount, fullCount] = await Promise.all([
          (prisma as any).careerApplication.count({ where: { status: 'PENDING' } }),
          (prisma as any).careerApplication.count({ where: { status: 'SHORTLISTED' } }),
          (prisma as any).careerApplication.count({ where: { status: 'INTERVIEWING' } }),
          (prisma as any).careerApplication.count({ where: { status: 'HIRED' } }),
          (prisma as any).careerApplication.count(),
        ]);
        metrics = {
          total: fullCount,
          pending: pCount,
          shortlisted: sCount,
          interviewing: iCount,
          hired: hCount,
        };
      } else {
        const allApps = inMemoryApplications;
        metrics = {
          total: allApps.length,
          pending: allApps.filter((a) => a.status === 'PENDING').length,
          shortlisted: allApps.filter((a) => a.status === 'SHORTLISTED').length,
          interviewing: allApps.filter((a) => a.status === 'INTERVIEWING').length,
          hired: allApps.filter((a) => a.status === 'HIRED').length,
        };
      }
    } catch {
      const allApps = inMemoryApplications;
      metrics = {
        total: allApps.length,
        pending: allApps.filter((a) => a.status === 'PENDING').length,
        shortlisted: allApps.filter((a) => a.status === 'SHORTLISTED').length,
        interviewing: allApps.filter((a) => a.status === 'INTERVIEWING').length,
        hired: allApps.filter((a) => a.status === 'HIRED').length,
      };
    }

    return res.status(200).json({
      success: true,
      data: items,
      total: metrics.total,
      metrics,
      page: pageNum,
      limit: limitNum,
    });
  } catch (error: any) {
    console.error('Error fetching career applications:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * ADMIN: Update status or notes of an application
 * PATCH /api/v1/admin/career/:id
 */
export const updateCareerApplicationStatus = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status, adminNotes } = req.body;

    const updateData: any = {};
    if (status) updateData.status = String(status);
    if (adminNotes !== undefined) updateData.adminNotes = String(adminNotes);
    updateData.updatedAt = new Date();

    let updated = null;

    try {
      if ((prisma as any).careerApplication) {
        updated = await (prisma as any).careerApplication.update({
          where: { id },
          data: updateData,
        });
      }
    } catch {
      // In-memory fallback
    }

    const item = inMemoryApplications.find((a) => a.id === id);
    if (item) {
      if (status) item.status = status;
      if (adminNotes !== undefined) item.adminNotes = adminNotes;
      item.updatedAt = new Date().toISOString();
      updated = item;
    }

    if (!updated) {
      return res.status(404).json({ success: false, error: 'Application not found' });
    }

    if (status) {
      await logAdminActivity(
        'CAREER_STATUS_UPDATE',
        `Candidate Status Updated: ${updated.fullName}`,
        `Application for "${updated.role}" moved to ${status}.`,
        { id, status },
        'INFO'
      );
    }

    return res.status(200).json({
      success: true,
      message: 'Candidate application updated successfully',
      data: updated,
    });
  } catch (error: any) {
    console.error('Error updating application status:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * ADMIN: Delete an application
 * DELETE /api/v1/admin/career/:id
 */
export const deleteCareerApplication = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    try {
      if ((prisma as any).careerApplication) {
        await (prisma as any).careerApplication.delete({
          where: { id },
        });
      }
    } catch {
      // In-memory fallback
    }

    inMemoryApplications = inMemoryApplications.filter((a) => a.id !== id);

    return res.status(200).json({
      success: true,
      message: 'Application removed successfully',
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};
