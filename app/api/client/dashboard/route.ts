import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

/**
 * Get client dashboard data
 * Requires authentication
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

    // Only allow clients to access their own data
    if (session.user.role !== "client") {
      return NextResponse.json(
        { error: "Forbidden" },
        { status: 403 }
      );
    }

    // Get client data with links
    const client = await prisma.client.findUnique({
      where: { userId: session.user.id },
      include: {
        links: {
          orderBy: { createdAt: "desc" },
        },
        user: {
          select: {
            email: true,
            createdAt: true,
          },
        },
      },
    });

    if (!client) {
      return NextResponse.json(
        { error: "Client profile not found" },
        { status: 404 }
      );
    }

    // Group links by type
    const linksByType = {
      documents: client.links.filter((l: any) => l.linkType === "google_doc"),
      projects: client.links.filter((l: any) => l.linkType === "clickup"),
      data: client.links.filter((l: any) => l.linkType === "airtable"),
      other: client.links.filter(
        (l: any) => !["google_doc", "clickup", "airtable"].includes(l.linkType)
      ),
    };

    return NextResponse.json({
      client: {
        id: client.id,
        companyName: client.companyName,
        industry: client.industry,
        status: client.status,
        onboardingCompleted: client.onboardingCompleted,
        onboardingCompletedAt: client.onboardingCompletedAt,
        email: client.user.email,
        createdAt: client.createdAt,
      },
      links: linksByType,
      stats: {
        totalLinks: client.links.length,
        documentCount: linksByType.documents.length,
        projectCount: linksByType.projects.length,
        dataCount: linksByType.data.length,
      },
    });
  } catch (error) {
    console.error("Client dashboard error:", error);
    return NextResponse.json(
      { error: "Failed to fetch dashboard data" },
      { status: 500 }
    );
  }
}
