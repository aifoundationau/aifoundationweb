export type RegionalEduSessionStatus =
    | 'pending_payment'
    | 'paid_intake_ready'
    | 'generating_preliminary_draft'
    | 'awaiting_superadmin_improvement'
    | 'final_improved_delivered';

export type RegionalEduPaymentStatus = 'pending' | 'paid' | 'failed';
export type RegionalEduReviewStatus = 'unread_analysis' | 'in_review_editing' | 'final_improved_delivered';

export interface RegionalEduStripeMetadata {
    tag: 'aifoundation';
    businessId: 'aifoundation';
    businessName: 'AI Foundation';
    source: 'aifoundation';
    kind: 'regional_edu_advisory';
    uid: string;
    userId: string;
    serviceSlug: 'regulatory-roadmap';
    serviceName: 'Services - Regional Education & AI Literacy';
    serviceType: 'regional_education_ai_literacy_advisory';
    workflow: 'advisory_with_superadmin_improvement';
}

export interface RegionalEduPricingQuote {
    exGstCents: number;
    exGstAud: number;
    gstAud: number;
    totalIncGstAud: number;
    currency: 'AUD';
}

export interface RegionalEduIntakeAnswer {
    step: 1 | 2 | 3 | 4 | 5 | 6;
    topic: string;
    question: string;
    answer: string;
    hadSecrets: boolean;
    answeredAt: string;
}

export interface RegionalEduChatMessage {
    role: 'assistant' | 'user';
    step: number;
    content: string;
    createdAt: string;
}

export interface ClientNeedsSummary {
    organizationName: string;
    region: string;
    learnerProfile: string;
    connectivityProfile: string;
    dailyLiteracyGoals: string;
    privacyConstraints: string;
    oversightNeeds: string;
    budgetAndTimeline: string;
}

export interface PreliminaryAdvisoryDraftSections {
    executiveOverview: string;
    focus1RegulatoryAuditing: string;
    focus2GovernancePolicy: string;
    focus3PrivacyCompliance: string;
    focus4ThirtyDayRoadmap: string;
    lowBandwidthRecommendations: string;
}

export interface RegionalEduDeliverableFile {
    fileName: string;
    generatedAt: string;
    content: string;
}

export interface RegionalEduSessionRecord {
    id: string;
    tag: 'aifoundation';
    businessId: 'aifoundation';
    businessName: 'AI Foundation';
    source: 'aifoundation';
    uid: string;
    userEmail: string;
    userName: string;
    stripeSessionId: string;
    paymentStatus: RegionalEduPaymentStatus;
    amountPaidExGstAud: number;
    currency: 'AUD';
    status: RegionalEduSessionStatus;
    currentStep: number;
    totalSteps: 6;
    clientOrganizationName: string;
    regionGroundingSummary: string;
    needsSummary: ClientNeedsSummary | null;
    answers: RegionalEduIntakeAnswer[];
    messages: RegionalEduChatMessage[];
    preliminaryReport: RegionalEduDeliverableFile | null;
    finalImprovedReport: RegionalEduDeliverableFile | null;
    superadminExecutiveNote: string;
    superadminReviewId: string | null;
    superadminApprovedAt: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface RegionalEduSuperAdminReview {
    id: string;
    tag: 'aifoundation';
    businessId: 'aifoundation';
    businessName: 'AI Foundation';
    source: 'aifoundation';
    regionalEduSessionId: string;
    stripeSessionId: string;
    uid: string;
    clientEmail: string;
    clientOrganizationName: string;
    amountPaidExGstAud: number;
    reviewStatus: RegionalEduReviewStatus;
    read: boolean;
    summary: string;
    needsSummary: ClientNeedsSummary | null;
    intakeTranscript: string;
    researchSummary: string;
    preliminaryFileName: string;
    preliminaryTxtContent: string;
    workingDraftContent: string;
    superadminNote: string;
    finalFileName: string | null;
    finalTxtContent: string | null;
    approvedAt: string | null;
    modelUsed: string;
    createdAt: string;
    updatedAt: string;
}

export interface SuperadminDraftSaveInput {
    improvedTxtContent: string;
    superadminNote?: string;
}

export interface SuperadminImprovedPlanInput {
    improvedTxtContent: string;
    executiveNote?: string;
    confirmApprove: true;
}

export interface RegionalEduCheckoutResult {
    url: string | null;
    sessionId: string;
    stripeSessionId: string;
    pricing: RegionalEduPricingQuote;
}
