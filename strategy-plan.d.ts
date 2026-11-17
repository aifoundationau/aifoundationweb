export type StrategySessionStatus = 'pending_payment' | 'intake' | 'completed';
export type StrategyPaymentStatus = 'pending' | 'paid' | 'failed';
export type StrategyRole = 'supporter' | 'superadmin';

export interface StrategyStripeMetadata {
    tag: 'aifoundation';
    businessId: 'aifoundation';
    businessName: 'AI Foundation';
    source: 'aifoundation';
    kind: 'strategy_plan';
    uid: string;
    userId: string;
    serviceName: 'Services - Google AI Strategy & First-Month Plan';
    serviceType: 'google_ai_strategy_advisory_30_day';
}

export interface StrategyPricingQuote {
    exGstCents: number;
    exGstAud: number;
    gstAud: number;
    totalIncGstAud: number;
    currency: 'AUD';
}

export interface StrategyIntakeAnswer {
    step: 1 | 2 | 3 | 4 | 5 | 6;
    topic: string;
    question: string;
    answer: string;
    hadSecrets: boolean;
    answeredAt: string;
}

export interface StrategyChatMessage {
    role: 'assistant' | 'user';
    step: number;
    content: string;
    createdAt: string;
}

export interface PreliminaryAdvisorySections {
    executiveSummary: string;
    weeklyHoursRecoverable: string;
    bottleneckAssessment: string;
    pillar1Roadmap: string;
    pillar2Connectors: string;
    pillar3Security: string;
    customerCommitments: string;
}

export interface StrategyDeliverableFile {
    fileName: string;
    generatedAt: string;
    content: string;
}

export interface StrategySessionRecord {
    id: string;
    tag: 'aifoundation';
    businessId: 'aifoundation';
    businessName: 'AI Foundation';
    source: 'aifoundation';
    uid: string;
    userEmail: string;
    userName: string;
    stripeSessionId: string;
    paymentStatus: StrategyPaymentStatus;
    amountPaidExGstAud: number;
    currency: 'AUD';
    status: StrategySessionStatus;
    currentStep: number;
    totalSteps: 6;
    clientBusinessName: string;
    nicheGroundingSummary: string;
    answers: StrategyIntakeAnswer[];
    messages: StrategyChatMessage[];
    preliminaryReport: StrategyDeliverableFile | null;
    superadminBriefId: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface SuperAdminAdvisoryBrief {
    id: string;
    tag: 'aifoundation';
    businessId: 'aifoundation';
    businessName: 'AI Foundation';
    source: 'aifoundation';
    strategySessionId: string;
    stripeSessionId: string;
    uid: string;
    clientEmail: string;
    clientBusinessName: string;
    amountPaidExGstAud: number;
    fileName: string;
    summary: string;
    content: string;
    read: boolean;
    modelUsed: string;
    createdAt: string;
    updatedAt: string;
}

export interface StrategyChatTurnInput {
    sessionId: string;
    message: string;
}

export interface StrategyChatTurnResponse {
    session: StrategySessionRecord;
    redactedWarning: string | null;
}
