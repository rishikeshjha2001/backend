import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { logAdminActivity } from './adminActivity.controller';

const prisma = new PrismaClient();

// In-memory fallback if table hasn't been migrated on the remote database yet
let inMemorySupportTickets: any[] = [];

/**
 * USER: Submit a Support / Help Ticket
 */
export const createSupportTicket = async (req: Request, res: Response) => {
  try {
    const { userName, userEmail, userPhone, category, subject, message, priority, userId } = req.body;

    if (!userName || !userPhone || !subject || !message) {
      return res.status(400).json({
        success: false,
        error: 'Please provide your name, phone number, subject, and detailed message.',
      });
    }

    const authenticatedUserId = (req as any).user?.id;
    const cleanPhone = String(userPhone).replace(/\D/g, '').slice(-10);
    const ticketNumber = `HL-SUP-${Math.floor(1000 + Math.random() * 9000)}`;

    const newTicketData = {
      ticketNumber,
      userId: authenticatedUserId || userId || null,
      userName: String(userName).trim(),
      userEmail: userEmail ? String(userEmail).trim().toLowerCase() : null,
      userPhone: cleanPhone || String(userPhone).trim(),
      category: category ? String(category).trim().toUpperCase() : 'GENERAL',
      subject: String(subject).trim(),
      message: String(message).trim(),
      priority: priority ? String(priority).trim().toUpperCase() : 'MEDIUM',
      status: 'OPEN',
      adminReply: null,
      resolvedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    let ticket: any;
    try {
      if ((prisma as any).supportTicket) {
        ticket = await (prisma as any).supportTicket.create({
          data: newTicketData,
        });
      }
    } catch (dbErr) {
      console.warn('[SupportTicket] Prisma write error, fallback to in-memory:', dbErr);
    }

    if (!ticket) {
      ticket = { id: `sup_${Date.now()}`, ...newTicketData };
      inMemorySupportTickets.unshift(ticket);
    }

    // Universal Admin Activity Notification
    logAdminActivity(
      'SUPPORT_TICKET_CREATED',
      `🆘 New Support Ticket: ${ticketNumber}`,
      `${ticket.userName} (${ticket.userPhone}) requested support: "${ticket.subject}"`,
      {
        ticketId: ticket.id,
        ticketNumber: ticket.ticketNumber,
        userPhone: ticket.userPhone,
        category: ticket.category,
        priority: ticket.priority,
      },
      ticket.priority === 'URGENT' || ticket.priority === 'HIGH' ? 'URGENT' : 'WARNING'
    ).catch(() => {});

    res.status(201).json({
      success: true,
      message: 'Support ticket submitted successfully. Our concierge team will reach out to you shortly.',
      data: ticket,
    });
  } catch (error: any) {
    console.error('Error creating support ticket:', error);
    res.status(500).json({ success: false, error: error.message || 'Support ticket submission failed' });
  }
};

/**
 * ADMIN: Get all Support Tickets with metrics and filters
 */
export const getSupportTicketsAdmin = async (req: Request, res: Response) => {
  try {
    const { status, priority, category, q } = req.query;

    let tickets: any[] = [];
    try {
      if ((prisma as any).supportTicket) {
        const where: any = {};
        if (status && status !== 'ALL') where.status = String(status);
        if (priority && priority !== 'ALL') where.priority = String(priority);
        if (category && category !== 'ALL') where.category = String(category);
        if (q) {
          const queryStr = String(q).trim();
          where.OR = [
            { ticketNumber: { contains: queryStr, mode: 'insensitive' } },
            { userName: { contains: queryStr, mode: 'insensitive' } },
            { userPhone: { contains: queryStr, mode: 'insensitive' } },
            { subject: { contains: queryStr, mode: 'insensitive' } },
            { message: { contains: queryStr, mode: 'insensitive' } },
          ];
        }

        tickets = await (prisma as any).supportTicket.findMany({
          where,
          orderBy: { createdAt: 'desc' },
        });
      }
    } catch (dbErr) {
      console.warn('[SupportTicket] DB fetch error, using memory fallback:', dbErr);
    }

    if (tickets.length === 0 && inMemorySupportTickets.length > 0) {
      tickets = inMemorySupportTickets;
      if (status && status !== 'ALL') tickets = tickets.filter(t => t.status === status);
      if (priority && priority !== 'ALL') tickets = tickets.filter(t => t.priority === priority);
    }

    // Metrics summary
    const allList = tickets.length > 0 ? tickets : inMemorySupportTickets;
    const metrics = {
      total: allList.length,
      open: allList.filter(t => t.status === 'OPEN').length,
      inProgress: allList.filter(t => t.status === 'IN_PROGRESS').length,
      resolved: allList.filter(t => t.status === 'RESOLVED' || t.status === 'CLOSED').length,
      urgent: allList.filter(t => (t.priority === 'URGENT' || t.priority === 'HIGH') && t.status !== 'RESOLVED').length,
    };

    res.status(200).json({
      success: true,
      metrics,
      data: tickets,
    });
  } catch (error: any) {
    console.error('Error fetching support tickets for admin:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * ADMIN: Update Support Ticket Status and Add Reply
 */
export const updateSupportTicketStatus = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status, adminReply, priority } = req.body;

    let updatedTicket: any = null;
    const dataToUpdate: any = {};
    if (status) {
      dataToUpdate.status = String(status).toUpperCase();
      if (dataToUpdate.status === 'RESOLVED' || dataToUpdate.status === 'CLOSED') {
        dataToUpdate.resolvedAt = new Date();
      }
    }
    if (adminReply !== undefined) dataToUpdate.adminReply = String(adminReply).trim();
    if (priority) dataToUpdate.priority = String(priority).toUpperCase();

    try {
      if ((prisma as any).supportTicket) {
        updatedTicket = await (prisma as any).supportTicket.update({
          where: { id },
          data: dataToUpdate,
        });
      }
    } catch (dbErr) {
      console.warn('[SupportTicket] DB update fallback:', dbErr);
    }

    if (!updatedTicket) {
      const idx = inMemorySupportTickets.findIndex(t => t.id === id);
      if (idx !== -1) {
        inMemorySupportTickets[idx] = { ...inMemorySupportTickets[idx], ...dataToUpdate };
        updatedTicket = inMemorySupportTickets[idx];
      }
    }

    if (!updatedTicket) {
      return res.status(404).json({ success: false, error: 'Support ticket not found' });
    }

    // Log admin notification
    logAdminActivity(
      'SUPPORT_TICKET_UPDATED',
      `Support Ticket ${updatedTicket.ticketNumber || id}: ${updatedTicket.status}`,
      `Ticket was marked as ${updatedTicket.status}. Resolution reply recorded.`,
      { ticketId: id, status: updatedTicket.status },
      'INFO'
    ).catch(() => {});

    // Notify user if ticket has associated userId
    if (updatedTicket.userId) {
      try {
        const notif = await prisma.notification.create({
          data: {
            title: `Support Ticket Update: ${updatedTicket.ticketNumber || id}`,
            message: `Your support inquiry has been marked as ${updatedTicket.status}.${adminReply ? ` Concierge note: ${adminReply}` : ''}`,
            targetRole: 'USER',
            type: 'SUPPORT',
          },
        });
        await prisma.userNotification.create({
          data: {
            userId: updatedTicket.userId,
            notificationId: notif.id,
            isRead: false,
          },
        }).catch(() => {});
      } catch (err) {
        console.error('Failed to dispatch user support notification:', err);
      }
    }

    res.status(200).json({
      success: true,
      message: 'Support ticket updated successfully',
      data: updatedTicket,
    });
  } catch (error: any) {
    console.error('Error updating support ticket:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * ADMIN: Delete Support Ticket
 */
export const deleteSupportTicket = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    try {
      if ((prisma as any).supportTicket) {
        await (prisma as any).supportTicket.delete({ where: { id } });
      }
    } catch (dbErr) {
      console.warn('[SupportTicket] DB delete fallback:', dbErr);
    }

    inMemorySupportTickets = inMemorySupportTickets.filter(t => t.id !== id);

    res.status(200).json({ success: true, message: 'Support ticket deleted successfully' });
  } catch (error: any) {
    console.error('Error deleting support ticket:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * USER: Get tickets for user by phone
 */
export const getUserSupportTickets = async (req: Request, res: Response) => {
  try {
    const caller = (req as any).user;
    let targetPhone = req.query.phone ? String(req.query.phone).trim() : null;
    let targetUserId = caller?.id || null;

    // Security check: If caller is authenticated as USER, lock to their phone or ID
    if (caller && caller.role !== 'ADMIN' && caller.role !== 'SUPER_ADMIN') {
      targetPhone = caller.phone || targetPhone;
      targetUserId = caller.id;
    }

    if (!targetPhone && !targetUserId) {
      return res.status(400).json({ success: false, error: 'Phone number or user authentication required to retrieve tickets.' });
    }

    const cleanPhone = targetPhone ? targetPhone.replace(/\D/g, '').slice(-10) : '';
    let tickets: any[] = [];

    try {
      if ((prisma as any).supportTicket) {
        const orClauses: any[] = [];
        if (targetUserId) orClauses.push({ userId: targetUserId });
        if (cleanPhone) orClauses.push({ userPhone: { contains: cleanPhone } });
        if (targetPhone) orClauses.push({ userPhone: targetPhone });

        tickets = await (prisma as any).supportTicket.findMany({
          where: { OR: orClauses },
          orderBy: { createdAt: 'desc' },
        });
      }
    } catch (dbErr) {
      console.warn('[SupportTicket] User tickets DB error:', dbErr);
    }

    if (tickets.length === 0 && cleanPhone) {
      tickets = inMemorySupportTickets.filter(t => t.userPhone?.includes(cleanPhone) || (targetUserId && t.userId === targetUserId));
    }

    res.status(200).json({ success: true, data: tickets });
  } catch (error: any) {
    console.error('Error fetching user support tickets:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};
