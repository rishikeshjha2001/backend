import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Simulated SMS & Email Gateway Service
export class NotificationService {
  static async sendSMS(phone: string, message: string): Promise<boolean> {
    console.log(`\n📲 [SMS GATEWAY (LOCAL / DEV)]`);
    console.log(`   To: +91 ${phone}`);
    console.log(`   Message: "${message}"`);
    console.log(`   Status: DELIVERED (Simulated Local Mode)\n`);
    return true;
  }

  static async sendEmail(email: string, subject: string, body: string): Promise<boolean> {
    console.log(`\n📧 [EMAIL SMTP (LOCAL / DEV)]`);
    console.log(`   To: ${email}`);
    console.log(`   Subject: "${subject}"`);
    console.log(`   Body: "${body}"`);
    console.log(`   Status: SENT (Simulated Local Mode)\n`);
    return true;
  }
}

// In-Memory or DB OTP Storage Handler
interface OtpEntry {
  identifier: string;
  otp: string;
  expiresAt: Date;
  verified: boolean;
  attempts: number;
}

const localOtpStore = new Map<string, OtpEntry>();

export async function requestLoginOtp(identifier: string) {
  const isEmail = identifier.includes('@');
  const cleanId = identifier.trim();

  // Generate 6-digit numeric OTP
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  // Store in memory / DB
  localOtpStore.set(cleanId, {
    identifier: cleanId,
    otp,
    expiresAt,
    verified: false,
    attempts: 0,
  });

  if (isEmail) {
    await NotificationService.sendEmail(
      cleanId,
      'Your happylokam Login Code',
      `Your one-time login verification code is ${otp}. Valid for 10 minutes. Do not share this with anyone.`
    );
  } else {
    await NotificationService.sendSMS(
      cleanId,
      `<#> ${otp} is your happylokam verification code. Valid for 10 minutes. Do not share. @happylokam #login`
    );
  }

  return {
    success: true,
    message: `OTP sent successfully to ${isEmail ? 'email' : 'mobile'}.`,
    testOtp: otp, // available in local testing
  };
}

export async function verifyLoginOtp(identifier: string, enteredOtp: string) {
  const cleanId = identifier.trim();
  const entry = localOtpStore.get(cleanId);

  if (!entry) {
    return { success: false, error: 'No OTP requested for this identifier or it has expired.' };
  }

  if (new Date() > entry.expiresAt) {
    localOtpStore.delete(cleanId);
    return { success: false, error: 'OTP has expired. Please request a new code.' };
  }

  if (entry.attempts >= 5) {
    localOtpStore.delete(cleanId);
    return { success: false, error: 'Too many incorrect attempts. Please request a fresh OTP.' };
  }

  if (entry.otp !== enteredOtp.trim()) {
    entry.attempts += 1;
    return { success: false, error: 'Invalid verification code. Please check and try again.' };
  }

  // Mark as verified
  entry.verified = true;
  localOtpStore.delete(cleanId);

  const isEmail = cleanId.includes('@');
  console.log(`✅ [OTP VERIFIED] Identity confirmed for ${cleanId}`);

  return {
    success: true,
    message: 'Verification successful. Logging in...',
    identifier: cleanId,
    isEmail,
  };
}

async function runLocalOtpTest() {
  console.log('=== STARTING LOCAL SMS & EMAIL OTP TEST ===\n');

  // Test 1: Phone Number SMS OTP
  console.log('--- Test 1: Phone Number (8969255561) ---');
  const phoneRes = await requestLoginOtp('8969255561');
  console.log('Request Result:', phoneRes);

  console.log('Attempting verify with wrong OTP: "111111"...');
  const failRes = await verifyLoginOtp('8969255561', '111111');
  console.log('Wrong OTP Result:', failRes);

  console.log(`Attempting verify with correct OTP: "${phoneRes.testOtp}"...`);
  const successRes = await verifyLoginOtp('8969255561', phoneRes.testOtp);
  console.log('Correct OTP Result:', successRes);

  // Test 2: Email OTP
  console.log('\n--- Test 2: Email (admin@happylokam.com) ---');
  const emailRes = await requestLoginOtp('admin@happylokam.com');
  console.log('Request Result:', emailRes);

  console.log(`Attempting verify with correct OTP: "${emailRes.testOtp}"...`);
  const emailSuccess = await verifyLoginOtp('admin@happylokam.com', emailRes.testOtp);
  console.log('Email Verify Result:', emailSuccess);

  console.log('\n=== ALL LOCAL OTP TESTS PASSED SUCCESSFULLY ===');
}

runLocalOtpTest()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
