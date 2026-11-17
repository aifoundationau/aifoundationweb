export type ManagedAgentSessionStatus =
    | 'pending_payment'
    | 'paid_intake_ready'
    | 'generating_preliminary_draft'
    | 'awaiting_superadmin_improvement'
    | 'final_improved_delivered';

export type ManagedAgentPaymentStatus = 'pending' | 'paid' | 'failed';
export type ManagedAgentReviewStatus = 'unread_analysis' | 'in_review_editing' | 'final_improved_delivered';

export interface ManagedAgentStripeMetadata {
    tag: 'aifoundation';
    businessId: '#aifoundation';
    businessName: 'AI Foundation';
    source: 'aifoundation';
    kind: 'managed_agent_advisory';
    uid: string;
    userId: string;
    serviceSlug: 'ai-agent-hosting';
    serviceName: 'Services - Managed AI Agent Hosting & Maintenance';
    serviceType: 'managed_ai_agent_hosting_maintenance_advisory';
    workflow: 'advisory_with_superadmin_improvement';
}

export interface ManagedAgentPricingQuote {
    exGstCents: number;
    exGstAud: number;
    gstAud: number;
    totalIncGstAud: number;
    currency: 'AUD';
}

export interface ManagedAgentIntakeAnswer {
    step: 1 | 2 | 3 | 4 | 5 | 6;
    topic: string;
    question: string;
    answer: string;
    hadSecrets: boolean;
    answeredAt: string;
}

export interface ManagedAgentNeedsSummary {
    organizationName: string;
    industryAndWorkflows: string;
    agentTasksAndTools: string;
    slaAndLatency: string;
    hostingAndSafety: string;
    observabilityAndMaintenance: string;
    budgetAndMilestones: string;
}

export interface ManagedAgentDeliverableFile {
    fileName: string;
    generatedAt: string;
    content: string;
}

export interface ManagedAgentSessionRecord {
    id: string;
    tag: 'aifoundation';
    businessId: '#aifoundation' | 'aifoundation';
    businessName: 'AI Foundation';
    source: 'aifoundation';
    uid: string;
    userEmail: string;
    userName: string;
    stripeSessionId: string;
    paymentStatus: ManagedAgentPaymentStatus;
    amountPaidExGstAud: number;
    currency: 'AUD';
    status: ManagedAgentSessionStatus;
    currentStep: number;
    totalSteps: 6;
    clientOrganizationName: string;
    sectorOrWorkflowTag: string;
    groundingSummary: string;
    needsSummary: ManagedAgentNeedsSummary | null;
    answers: ManagedAgentIntakeAnswer[];
    messages: Array<{ role: 'assistant' | 'user'; step: number; content: string; createdAt: string }>;
    preliminaryReport: ManagedAgentDeliverableFile | null;
    finalImprovedReport: ManagedAgentDeliverableFile | null;
    superadminExecutiveNote: string;
    superadminReviewId: string | null;
    reviewedByUid: string | null;
    superadminApprovedAt: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface ManagedAgentSuperAdminReview {
    id: string;
    tag: 'aifoundation';
    businessId: '#aifoundation' | 'aifoundation';
    businessName: 'AI Foundation';
    source: 'aifoundation';
    advisorySessionId: string;
    stripeSessionId: string;
    uid: string;
    clientEmail: string;
    clientOrganizationName: string;
    sectorOrWorkflowTag: string;
    amountPaidExGstAud: number;
    reviewStatus: ManagedAgentReviewStatus;
    read: boolean;
    subject: string;
    summary: string;
    needsSummary: ManagedAgentNeedsSummary | null;
    intakeTranscript: string;
    researchSummary: string;
    preliminaryFileName: string;
    preliminaryTxtContent: string;
    workingDraftContent: string;
    superadminNote: string;
    finalFileName: string | null;
    finalTxtContent: string | null;
    reviewedByUid: string | null;
    reviewedAt: string | null;
    approvedAt: string | null;
    modelUsed: string;
    createdAt: string;
    updatedAt: string;
}

export interface SuperadminFinalManagedAgentInput {
    improvedTxtContent: string;
    executiveNote?: string;
    confirmApprove: true;
}
