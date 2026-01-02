import { z } from "zod";

export const SegmentSchema = z.enum(["VIP", "LEAL_ESTABLE", "EN_RIESGO", "NUEVO", "DORMIDO", "LIGERO"]);

export const RiskLevelSchema = z.enum(["LOW", "MEDIUM", "HIGH"]);

export const NextBestActionSchema = z.enum(["RENOVAR_PACK", "CUIDAR_VIP", "BIENVENIDA", "REACTIVAR_DORMIDO", "OFRECER_EXTRA", "NEUTRO"]);

export const RelationshipStageSchema = z.enum(["NUEVO", "CALENTANDO", "FIEL", "RIESGO"]);

export const CommunicationStyleSchema = z.enum(["CERCANO", "DIRECTO", "JUGUETON", "SERIO"]);

const ManagerMessageSuggestionSchema = z.object({
  id: z.string(),
  label: z.string(),
  text: z.string(),
});

export const ManagerSummarySchema = z.object({
  profile: z.string(),
  recent: z.string(),
  opportunity: z.string(),
});

const FanMonetizationSummarySchema = z.object({
  subscription: z.object({
    active: z.boolean(),
    price: z.number(),
    daysLeft: z.number().nullable(),
  }),
  extras: z.object({
    count: z.number(),
    total: z.number(),
  }),
  tips: z.object({
    count: z.number(),
    total: z.number(),
  }),
  gifts: z.object({
    count: z.number(),
    total: z.number(),
  }),
  totalSpent: z.number(),
  recent30dSpent: z.number(),
  lastPurchaseAt: z.string().nullable(),
});

export const FanManagerAiContextSchema = z.object({
  fanId: z.string(),
  displayName: z.string(),
  segment: SegmentSchema,
  stageLabel: z.string(),
  riskLevel: RiskLevelSchema,
  healthScore: z.number().nullable(),
  lifetimeSpent: z.number().nullable(),
  spentLast30Days: z.number().nullable(),
  extrasCount: z.number().nullable(),
  daysSinceLastMessage: z.number().nullable(),
  daysToRenewal: z.number().nullable(),
  hasActiveMonthly: z.boolean(),
  hasActiveTrial: z.boolean(),
  hasActiveSpecialPack: z.boolean(),
  summary: ManagerSummarySchema,
  mode: z.string().nullable().optional(),
});

export const CreatorAiContextSchema = z.object({
  totalFans: z.number(),
  activeFans: z.number(),
  trialOrFirstMonthFans: z.number(),
  churn30d: z.number(),
  vipFans: z.number(),
  monthlyExtraRevenue: z.number(),
  monthlySubsRevenue: z.number(),
  topPackType: z.string().nullable(),
  lowStockPackTypes: z.array(z.string()),
  avgMessagesPerFan: z.number().nullable(),
  lastContentRefreshDays: z.number().nullable(),
});

export const CreatorAiAdvisorInputSchema = z.object({
  context: CreatorAiContextSchema,
  prompt: z.string(),
  preview: z.object({
    headline: z.string(),
    riskLevel: z.enum(["BAJO", "MEDIO", "ALTO"]),
    summaryLines: z.array(z.string()),
  }),
});

export const FanManagerSummarySchema = z.object({
  fanId: z.string(),
  segment: SegmentSchema,
  riskLevel: RiskLevelSchema,
  healthScore: z.number().min(0).max(100),
  hasActivePack: z.boolean(),
  daysToExpiry: z.number().nullable(),
  recent30dSpend: z.number(),
  lifetimeValue: z.number(),
  priorityRank: z.number().nullable(),
  priorityReason: z.string(),
  nextBestAction: NextBestActionSchema,
  recommendedButtons: z.array(z.string()),
  objectiveToday: z.string(),
  messageSuggestions: z.array(ManagerMessageSuggestionSchema),
  relationshipStage: RelationshipStageSchema,
  communicationStyle: CommunicationStyleSchema.nullable().optional(),
  lastTopic: z.string().nullable().optional(),
  personalizationHints: z.string().nullable().optional(),
  summary: ManagerSummarySchema,
  aiContext: FanManagerAiContextSchema,
  monetization: FanMonetizationSummarySchema.nullable().optional(),
});

export type FanManagerSummary = z.infer<typeof FanManagerSummarySchema>;
export type RelationshipStage = z.infer<typeof RelationshipStageSchema>;
export type CommunicationStyle = z.infer<typeof CommunicationStyleSchema>;
export type FanManagerAiContext = z.infer<typeof FanManagerAiContextSchema>;
export type CreatorAiContext = z.infer<typeof CreatorAiContextSchema>;
export type CreatorAiAdvisorInput = z.infer<typeof CreatorAiAdvisorInputSchema>;

export const FanQueueItemSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  segment: SegmentSchema,
  riskLevel: RiskLevelSchema,
  healthScore: z.number(),
  daysToExpiry: z.number().nullable(),
  lifetimeValue: z.number(),
  recent30dSpend: z.number(),
  relationshipStage: RelationshipStageSchema,
});

export type FanQueueItem = z.infer<typeof FanQueueItemSchema>;
