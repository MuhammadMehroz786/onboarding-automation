import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword, generateUniqueClientId } from "@/lib/auth-utils";
import axios from "axios";

export async function POST(request: NextRequest) {
  try {
    const data = await request.json();

    // Validate required fields
    if (!data.email || !data.password || !data.companyName) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: data.email },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: "User with this email already exists" },
        { status: 409 }
      );
    }

    // Hash password
    const passwordHash = await hashPassword(data.password);

    // Generate unique client ID
    const uniqueClientId = generateUniqueClientId();

    // Create user and client in a transaction
    const result = await prisma.$transaction(async (tx: any) => {
      // Create user
      const user = await tx.user.create({
        data: {
          email: data.email,
          passwordHash,
          role: "client",
        },
      });

      // Create client profile
      const client = await tx.client.create({
        data: {
          userId: user.id,
          uniqueClientId,

          // Step 1: Business Fundamentals
          companyName: data.companyName,
          industry: data.industry,
          websiteUrl: data.websiteUrl || null,
          companyDescription: data.companyDescription || null,
          employeeCount: data.employeeCount || null,
          businessModel: data.businessModel || null,

          // Step 2: Marketing State
          workedWithAgency: data.workedWithAgency || null,
          currentChannels: data.currentChannels || null,
          marketingFeedback: data.marketingFeedback || null,
          primaryChallenges: data.primaryChallenges || null,

          // Step 3: Analytics & Tracking
          hasGoogleAnalytics: data.hasGoogleAnalytics || null,
          hasFacebookPixel: data.hasFacebookPixel || null,
          trackingTools: data.trackingTools || null,
          canProvideAnalyticsAccess: data.canProvideAnalyticsAccess || null,
          analyticsNotes: data.analyticsNotes || null,

          // Step 4: Social Media & Platforms
          socialPlatforms: data.socialPlatforms || null,
          hasFbBusinessManager: data.hasFbBusinessManager || null,
          hasGoogleAds: data.hasGoogleAds || null,

          // Step 5: Goals & Objectives
          primaryGoal: data.primaryGoal,
          successDefinition: data.successDefinition || null,
          keyMetrics: data.keyMetrics || null,
          revenueTarget: data.revenueTarget || null,
          targetCpa: data.targetCpa || null,
          targetRoas: data.targetRoas || null,

          // Step 6: Audience & Competitors
          idealCustomerProfile: data.idealCustomerProfile,
          geographicTargeting: data.geographicTargeting || null,
          ageRange: data.ageRange || null,
          genderTargeting: data.genderTargeting || null,
          competitors: data.competitors || null,
          competitorStrengths: data.competitorStrengths || null,

          // Step 7: Budget & Resources
          monthlyBudgetRange: data.monthlyBudgetRange,
          hasCreativeAssets: data.hasCreativeAssets || null,
          hasMarketingContact: data.hasMarketingContact || null,
          marketingContactName: data.marketingContactName || null,
          marketingContactEmail: data.marketingContactEmail || null,

          // Metadata
          onboardingCompleted: true,
          onboardingCompletedAt: new Date(),
          status: "pending",
        },
      });

      return { user, client };
    });

    // Send data to N8N webhook (asynchronously)
    const n8nWebhookUrl = process.env.N8N_ONBOARDING_WEBHOOK_URL;

    if (n8nWebhookUrl) {
      // Fire and forget - don't await
      sendToN8N(n8nWebhookUrl, {
        uniqueClientId,
        clientId: result.client.id,
        email: data.email,
        companyName: data.companyName,
        industry: data.industry,
        websiteUrl: data.websiteUrl,
        onboardingData: {
          businessInfo: {
            companyName: data.companyName,
            industry: data.industry,
            websiteUrl: data.websiteUrl,
            companyDescription: data.companyDescription,
            employeeCount: data.employeeCount,
            businessModel: data.businessModel,
          },
          marketingState: {
            workedWithAgency: data.workedWithAgency,
            currentChannels: data.currentChannels,
            marketingFeedback: data.marketingFeedback,
            primaryChallenges: data.primaryChallenges,
          },
          analytics: {
            hasGoogleAnalytics: data.hasGoogleAnalytics,
            hasFacebookPixel: data.hasFacebookPixel,
            trackingTools: data.trackingTools,
            canProvideAnalyticsAccess: data.canProvideAnalyticsAccess,
            analyticsNotes: data.analyticsNotes,
          },
          socialMedia: {
            socialPlatforms: data.socialPlatforms,
            hasFbBusinessManager: data.hasFbBusinessManager,
            hasGoogleAds: data.hasGoogleAds,
          },
          goals: {
            primaryGoal: data.primaryGoal,
            successDefinition: data.successDefinition,
            keyMetrics: data.keyMetrics,
            revenueTarget: data.revenueTarget,
            targetCpa: data.targetCpa,
            targetRoas: data.targetRoas,
          },
          audience: {
            idealCustomerProfile: data.idealCustomerProfile,
            geographicTargeting: data.geographicTargeting,
            ageRange: data.ageRange,
            genderTargeting: data.genderTargeting,
            competitors: data.competitors,
            competitorStrengths: data.competitorStrengths,
          },
          budget: {
            monthlyBudgetRange: data.monthlyBudgetRange,
            hasCreativeAssets: data.hasCreativeAssets,
            hasMarketingContact: data.hasMarketingContact,
            marketingContactName: data.marketingContactName,
            marketingContactEmail: data.marketingContactEmail,
          },
        },
      }).catch((error) => {
        console.error("Failed to send to N8N:", error);
      });
    }

    return NextResponse.json({
      success: true,
      message: "Onboarding completed successfully",
      userId: result.user.id,
      clientId: result.client.id,
      uniqueClientId,
    });
  } catch (error) {
    console.error("Onboarding submission error:", error);
    return NextResponse.json(
      { error: "Failed to process onboarding" },
      { status: 500 }
    );
  }
}

// Helper function to send data to N8N
async function sendToN8N(webhookUrl: string, payload: any) {
  try {
    const response = await axios.post(webhookUrl, payload, {
      headers: {
        "Content-Type": "application/json",
      },
      timeout: 10000, // 10 second timeout
    });

    // Log the webhook call
    await prisma.n8nWebhookLog.create({
      data: {
        uniqueClientId: payload.uniqueClientId,
        clientId: payload.clientId,
        direction: "outbound",
        webhookType: "onboarding_complete",
        payload: payload,
        status: "success",
      },
    });

    return response.data;
  } catch (error: any) {
    // Log the failed webhook call
    await prisma.n8nWebhookLog.create({
      data: {
        uniqueClientId: payload.uniqueClientId,
        clientId: payload.clientId,
        direction: "outbound",
        webhookType: "onboarding_complete",
        payload: payload,
        status: "failed",
        errorMessage: error.message,
      },
    });

    throw error;
  }
}
