import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import ExcelJS from 'exceljs';

const prisma = new PrismaClient();

const sendExcel = async (res: Response, data: any[], sheetName: string, filename: string) => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(sheetName);

  if (data.length > 0) {
    const columns = Object.keys(data[0]).map((key) => ({
      header: key.charAt(0).toUpperCase() + key.slice(1),
      key,
      width: 25,
    }));
    worksheet.columns = columns;
    worksheet.addRows(data);
  }

  res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  await workbook.xlsx.write(res);
  res.end();
};

export const exportUsers = async (req: Request, res: Response) => {
  try {
    const users = await prisma.user.findMany({
      select: { id: true, name: true, email: true, phone: true, role: true, createdAt: true }
    });
    await sendExcel(res, users, 'Users', 'happylokam-users.xlsx');
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const exportPartners = async (req: Request, res: Response) => {
  try {
    const partners = await prisma.partner.findMany({
      select: { id: true, hlpId: true, name: true, email: true, phone: true, businessName: true, location: true, isVerified: true, subscriptionStatus: true, walletBalance: true, createdAt: true }
    });
    await sendExcel(res, partners, 'Partners', 'happylokam-partners.xlsx');
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const exportBookings = async (req: Request, res: Response) => {
  try {
    const bookings = await prisma.booking.findMany({
      include: { user: { select: { name: true, email: true } }, venue: { select: { name: true } }, partner: { select: { businessName: true } } }
    });
    const flat = bookings.map(b => ({
      id: b.id, customerName: b.user.name, customerEmail: b.user.email,
      venue: b.venue?.name || 'N/A', partner: b.partner.businessName,
      date: b.date, status: b.status, totalAmount: b.totalAmount, createdAt: b.createdAt
    }));
    await sendExcel(res, flat, 'Bookings', 'happylokam-bookings.xlsx');
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const exportSubscriptions = async (req: Request, res: Response) => {
  try {
    const subs = await prisma.partnerSubscription.findMany({
      include: { partner: { select: { name: true, businessName: true, hlpId: true } } }
    });
    const flat = subs.map(s => ({
      id: s.id, partnerName: s.partner.name, businessName: s.partner.businessName,
      hlpId: s.partner.hlpId, amount: s.amount, status: s.status,
      startDate: s.startDate, endDate: s.endDate, createdAt: s.createdAt
    }));
    await sendExcel(res, flat, 'Subscriptions', 'happylokam-subscriptions.xlsx');
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};
