import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

/**
 * Get all clients (Admin only)
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();

    if (!session || !session.user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Only allow admins
    if (session.user.role !== "admin") {
      return NextResponse.json(
        { error: "Forbidden - Admin access required" },
        { status: 403 }
      );
    }

    // Get all clients with their links and user info
    const clients = await prisma.client.findMany({
      include: {
        user: {
          select: {
            email: true,
            createdAt: true,
            lastLogin: true,
          },
        },
        links: true,
        _count: {
          select: {
            links: true,
            activityLogs: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    // Format the response
    const formattedClients = clients.map((client: any) => ({
      id: client.id,
      uniqueClientId: client.uniqueClientId,
      companyName: client.companyName,
      industry: client.industry,
      email: client.user.email,
      status: client.status,
      onboardingCompleted: client.onboardingCompleted,
      onboardingCompletedAt: client.onboardingCompletedAt,
      monthlyBudgetRange: client.monthlyBudgetRange,
      createdAt: client.createdAt,
      lastLogin: client.user.lastLogin,
      linkCount: client._count.links,
      activityCount: client._count.activityLogs,
      websiteUrl: client.websiteUrl,
    }));

    return NextResponse.json({
      clients: formattedClients,
      total: formattedClients.length,
    });
  } catch (error) {
    console.error("Admin clients fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch clients" },
      { status: 500 }
    );
  }
}
