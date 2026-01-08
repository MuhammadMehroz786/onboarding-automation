import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * N8N Callback Webhook
 * Receives generated links from N8N automation
 *
 * Expected payload:
 * {
 *   "uniqueClientId": "CL-123ABC",
 *   "clientId": "uuid",
 *   "secret": "your-secret-key",
 *   "links": [
 *     {
 *       "type": "google_doc",
 *       "title": "Marketing Strategy Document",
 *       "url": "https://docs.google.com/...",
 *       "description": "Client's personalized marketing strategy",
 *       "icon": "FileText"
 *     },
 *     {
 *       "type": "clickup",
 *       "title": "Project Board",
 *       "url": "https://app.clickup.com/...",
 *       "description": "Task management board",
 *       "icon": "Layout"
 *     },
 *     {
 *       "type": "airtable",
 *       "title": "Client Database",
 *       "url": "https://airtable.com/...",
 *       "description": "Centralized data repository",
 *       "icon": "Database"
 *     }
 *   ]
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const payload = await request.json();

    // Validate secret key
    const expectedSecret = process.env.N8N_CALLBACK_SECRET;
    if (expectedSecret && payload.secret !== expectedSecret) {
      return NextResponse.json(
        { error: "Invalid secret key" },
        { status: 401 }
      );
    }

    // Validate required fields
    if (!payload.uniqueClientId && !payload.clientId) {
      return NextResponse.json(
        { error: "Missing client identifier" },
        { status: 400 }
      );
    }

    if (!payload.links || !Array.isArray(payload.links)) {
      return NextResponse.json(
        { error: "Invalid or missing links array" },
        { status: 400 }
      );
    }

    // Find the client
    const client = await prisma.client.findFirst({
      where: {
        OR: [
          { id: payload.clientId || "" },
          { uniqueClientId: payload.uniqueClientId || "" },
        ],
      },
    });

    if (!client) {
      return NextResponse.json(
        { error: "Client not found" },
        { status: 404 }
      );
    }

    // Create client links in a transaction
    const createdLinks = await prisma.$transaction(
      payload.links.map((link: any) =>
        prisma.clientLink.create({
          data: {
            clientId: client.id,
            linkType: link.type || "other",
            title: link.title,
            url: link.url,
            description: link.description || null,
            icon: link.icon || null,
            generatedByN8n: true,
            n8nWorkflowId: link.workflowId || null,
          },
        })
      )
    );

    // Update client status to active
    await prisma.client.update({
      where: { id: client.id },
      data: { status: "active" },
    });

    // Log the webhook call
    await prisma.n8nWebhookLog.create({
      data: {
        clientId: client.id,
        uniqueClientId: client.uniqueClientId,
        direction: "inbound",
        webhookType: "links_generated",
        payload: payload,
        status: "success",
      },
    });

    // Log activity
    await prisma.activityLog.create({
      data: {
        clientId: client.id,
        activityType: "links_generated",
        activityDescription: `Generated ${createdLinks.length} resource links via N8N`,
        metadata: {
          linkCount: createdLinks.length,
          linkTypes: createdLinks.map((l: any) => l.linkType),
        },
      },
    });

    return NextResponse.json({
      success: true,
      message: "Links saved successfully",
      linksCreated: createdLinks.length,
      clientId: client.id,
    });
  } catch (error: any) {
    console.error("N8N callback error:", error);

    // Try to log the error if we have client info
    try {
      const payload = await request.json();
      if (payload.uniqueClientId || payload.clientId) {
        await prisma.n8nWebhookLog.create({
          data: {
            uniqueClientId: payload.uniqueClientId || null,
            direction: "inbound",
            webhookType: "links_generated",
            payload: payload,
            status: "failed",
            errorMessage: error.message,
          },
        });
      }
    } catch (logError) {
      console.error("Failed to log error:", logError);
    }

    return NextResponse.json(
      { error: "Failed to process callback" },
      { status: 500 }
    );
  }
}
