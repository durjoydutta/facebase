import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getSupabaseAdminClient } from "@/lib/supabaseClient";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    await requireAdmin();
    const { userId } = await params;
    const searchParams = request.nextUrl.searchParams;
    
    const now = new Date();
    const year = parseInt(searchParams.get("year") ?? now.getFullYear().toString());
    const month = parseInt(searchParams.get("month") ?? (now.getMonth() + 1).toString());

    if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
      return NextResponse.json(
        { error: "Invalid year or month parameters" },
        { status: 400 }
      );
    }

    // Calculate start and end of the month
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59, 999);

    const supabase = getSupabaseAdminClient();

    const { data, error } = await supabase
      .from("visits")
      .select("timestamp")
      .eq("matched_user_id", userId)
      .gte("timestamp", startDate.toISOString())
      .lte("timestamp", endDate.toISOString());

    if (error) {
      console.error("Error fetching attendance:", error);
      return NextResponse.json(
        { error: "Failed to fetch attendance data" },
        { status: 500 }
      );
    }

    // Extract timestamps
    const timestamps = data.map((d) => d.timestamp);

    return NextResponse.json({ timestamps });
  } catch (error) {
    console.error("Attendance API Error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
