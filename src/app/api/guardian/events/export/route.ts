export const dynamic = "force-dynamic"

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const CSV_HEADERS = ['id', 'event_type', 'event_timestamp', 'risk_score_at_event', 'escalation_stage', 'contact_notified'];

function escapeCSV(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function rowToCSV(event: Record<string, unknown>): string {
  return CSV_HEADERS.map(h => escapeCSV(event[h])).join(',');
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const eventType = searchParams.get('eventType');

    let query = (supabase as any)
      .from('crisis_events')
      .select('id, event_type, event_timestamp, risk_score_at_event, escalation_stage, contact_notified')
      .eq('user_id', user.id)
      .order('event_timestamp', { ascending: false });

    if (startDate) {
      query = query.gte('event_timestamp', startDate);
    }
    if (endDate) {
      query = query.lte('event_timestamp', endDate);
    }
    if (eventType) {
      query = query.eq('event_type', eventType);
    }

    const { data: events, error } = await query;

    if (error) {
      console.error('Error fetching crisis events for export:', error);
      return NextResponse.json({ error: 'Failed to fetch events' }, { status: 500 });
    }

    const rows = [
      CSV_HEADERS.join(','),
      ...(events as Record<string, unknown>[]).map(rowToCSV),
    ];
    const csv = rows.join('\n');

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': 'attachment; filename="guardian-events.csv"',
      },
    });
  } catch (error) {
    console.error('Error exporting crisis events:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
