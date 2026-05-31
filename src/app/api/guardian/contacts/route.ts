import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  encryptContactData,
  decryptContactData,
  generateOTP,
  hashVerificationCode,
  generateOptOutToken,
} from '@/lib/utils/guardian-encryption';
import { getSMSNotificationService, getEmailNotificationService } from '@/lib/notifications';

// GET - List emergency contacts
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get contacts
    const { data: contacts, error } = await (supabase as any)
      .from('emergency_contacts')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching emergency contacts:', error);
      return NextResponse.json(
        { error: 'Failed to fetch emergency contacts' },
        { status: 500 }
      );
    }

    // Decrypt contact data
    const decryptedContacts = (contacts as any[]).map((contact: any) => ({
      ...contact,
      contact_phone: contact.contact_phone ? decrypt(contact.contact_phone) : null,
      contact_email: contact.contact_email ? decrypt(contact.contact_email) : null,
      verification_code: undefined, // Never send verification code to client
    }));

    return NextResponse.json({
      success: true,
      data: decryptedContacts,
    });
  } catch (error) {
    console.error('Error fetching emergency contacts:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST - Add emergency contact
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const {
      name,
      phone,
      email,
      relationship,
      notificationLevel = 'critical_only',
    } = body;

    // Validate required fields
    if (!name || !relationship) {
      return NextResponse.json(
        { error: 'Missing required fields: name, relationship' },
        { status: 400 }
      );
    }

    if (!phone && !email) {
      return NextResponse.json(
        { error: 'At least one contact method (phone or email) is required' },
        { status: 400 }
      );
    }

    // Check 3-contact limit
    const { data: existingContacts, error: countError } = await (supabase as any)
      .from('emergency_contacts')
      .select('id')
      .eq('user_id', user.id)
      .eq('is_active', true);

    if (countError) {
      console.error('Error checking contact count:', countError);
      return NextResponse.json(
        { error: 'Failed to verify contact limit' },
        { status: 500 }
      );
    }

    if (existingContacts && existingContacts.length >= 3) {
      return NextResponse.json(
        { error: 'Maximum 3 emergency contacts allowed' },
        { status: 400 }
      );
    }

    // Generate OTP and opt-out token
    const otp = generateOTP(6);
    const hashedOTP = hashVerificationCode(otp);
    const optOutToken = generateOptOutToken();

    // Encrypt contact data
    const encryptedData = encryptContactData({
      phone: phone || undefined,
      email: email || undefined,
    });

    // Insert contact
    const { data: contact, error: insertError } = await (supabase as any)
      .from('emergency_contacts')
      .insert({
        user_id: user.id,
        contact_name: name,
        contact_phone: encryptedData.phone,
        contact_email: encryptedData.email,
        relationship,
        notification_level: notificationLevel,
        verification_code: hashedOTP,
        verification_sent_at: new Date().toISOString(),
        opt_out_token: optOutToken,
        can_receive_sms: !!phone,
        can_receive_email: !!email,
      })
      .select()
      .single();

    if (insertError) {
      console.error('Error creating emergency contact:', insertError);
      return NextResponse.json(
        { error: 'Failed to add emergency contact' },
        { status: 500 }
      );
    }

    // Send OTP via SMS and/or email using notification service
    const otpMessage = `Your Nebula AI Guardian Mode verification code is: ${otp}. This code expires in 15 minutes.`;
    const notificationPayload = {
      userId: user.id,
      type: 'CONTACT_VERIFICATION' as const,
      message: otpMessage,
      metadata: { contactId: (contact as any).id, contactName: name },
    };

    const notificationPromises: Promise<any>[] = [];

    if (phone) {
      const smsService = getSMSNotificationService();
      notificationPromises.push(
        smsService.notifyEmergencyContact(
          (contact as any).id,
          notificationPayload,
          undefined,
          phone,
          name
        ).catch((err) => {
          console.error('SMS OTP send failed:', err);
        })
      );
    }

    if (email) {
      const emailService = getEmailNotificationService();
      notificationPromises.push(
        emailService.notifyEmergencyContact(
          (contact as any).id,
          notificationPayload,
          email,
          undefined,
          name
        ).catch((err) => {
          console.error('Email OTP send failed:', err);
        })
      );
    }

    await Promise.all(notificationPromises);

    return NextResponse.json({
      success: true,
      data: {
        contactId: (contact as any).id,
        verificationSent: true,
        // In development mode, include OTP in response for testing
        otp: process.env.NODE_ENV === 'development' ? otp : undefined,
      },
    });
  } catch (error) {
    console.error('Error adding emergency contact:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Helper function to decrypt (imported from encryption utils)
function decrypt(encryptedText: string): string {
  try {
    const { decrypt: decryptFn } = require('@/lib/utils/guardian-encryption');
    return decryptFn(encryptedText);
  } catch (error) {
    console.error('Decryption error:', error);
    return '[Encrypted]';
  }
}
