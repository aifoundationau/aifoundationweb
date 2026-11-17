export type ToolGovernanceSessionStatus =
    | 'pending_payment'
    | 'paid_intake_ready'
    | 'generating_preliminary_draft'
    | 'awaiting_superadmin_improvement'
    | 'final_improved_delivered';

export type ToolGovernancePaymentStatus = 'pending' | 'paid' | 'failed';
export type ToolGovernanceReviewStatus = 'unread_analysis' | 'in_review_editing' | 'final_improved_delivered';

export interface ToolGovernanceStripeMetadata {
    tag: 'aifoundation';
    businessId: '#aifoundation';
    businessName: 'AI Foundation';
    source: 'aifoundation';
    kind: 'tool_governance_advisory';
    uid: string;
    userId: string;
    serviceSlug: 'stack-selection';
    serviceName: 'Services - AI Tool Selection & Governance Advisory';
    serviceType: 'ai_tool_selection_governance_advisory';
    workflow: 'advisory_with_superadmin_improvement';
}

export interface ToolGovernancePricingQuote {
    exGstCents: number;
    exGstAud: number;
    gstAud: number;
    totalIncGstAud: number;
    currency: 'AUD';
}

export interface ToolGovernanceIntakeAnswer {
    step: 1 | 2 | 3 | 4 | 5 | 6;
    topic: string;
    question: string;
    answer: string;
    hadSecrets: boolean;
    answeredAt: string;
}

export interface ToolGovernanceNeedsSummary {
    organizationName: string;
    sectorAndScale: string;
    multimodalWorkflows: string;
    precisionBoundaries: string;
    deploymentBoundary: string;
    environmentReadiness: string;
    budgetAndProcurementGoals: string;
}

export interface ToolGovernanceDeliverableFile {
    fileName: string;
    generatedAt: string;
    content: string;
}

export interface ToolGovernanceSessionRecord {
    id: string;
    tag: 'aifoundation';
    businessId: '#aifoundation' | 'aifoundation';
    businessName: 'AI Foundation';
    source: 'aifoundation';
    uid: string;
    userEmail: string;
    userName: string;
    stripeSessionId: string;
    paymentStatus: ToolGovernancePaymentStatus;
    amountPaidExGstAud: number;
    currency: 'AUD';
    status: ToolGovernanceSessionStatus;
    currentStep: number;
    totalSteps: 6;
    clientOrganizationName: string;
    sectorOrWorkflowTag: string;
    groundingSummary: string;
    needsSummary: ToolGovernanceNeedsSummary | null;
    answers: ToolGovernanceIntakeAnswer[];
    messages: Array<{ role: 'assistant' | 'user'; step: number; content: string; createdAt: string }>;
    preliminaryReport: ToolGovernanceDeliverableFile | null;
    finalImprovedReport: ToolGovernanceDeliverableFile | null;
    superadminExecutiveNote: string;
    superadminReviewId: string | null;
    reviewedByUid: string | null;
    superadminApprovedAt: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface ToolGovernanceSuperAdminReview {
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
    reviewStatus: ToolGovernanceReviewStatus;
    read: boolean;
    subject: string;
    summary: string;
    needsSummary: ToolGovernanceNeedsSummary | null;
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

export interface SuperadminFinalToolAdvisoryInput {
    improvedTxtContent: string;
    executiveNote?: string;
    confirmApprove: true;
}
