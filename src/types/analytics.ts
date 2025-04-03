/**
 * Raw iot data in analytics database
 */
export interface RawIotData {
  id: string;
  projectId: string;  // Scoped to project without workspaceId
  sourceId: string;   // Device ID or Asset ID
  data: Record<string, any>;  // Raw data payload
  timestamp: string;
  receivedAt: string;
  metadata?: {
    deviceName?: string;
    sensorType?: string;
    assetType?: string;
    location?: string;
  };
}

/**
 * Enriched (cleaned) data in analytics database
 */
export interface EnrichedData {
  id: string;
  projectId: string;  // Scoped to project without workspaceId
  sourceId: string;   // Original raw data ID
  sourceType: "device" | "asset";
  entityType: string;  // "device_data", "financial_record", etc.
  data: Record<string, any>;  // Cleaned and standardized data
  attributes: Record<string, {
    type: string;
    value: any;
    unit?: string;
  }>;
  metadata?: Record<string, any>;
  enrichedAt: string;
  createdAt: string;
}

/**
 * Processed (analyzed) data in analytics database
 */
export interface ProcessedData {
  id: string;
  projectId: string;  // Scoped to project without workspaceId
  sourceIds: string[];  // IDs of enriched data that contributed
  analysisType: "pattern" | "anomaly" | "relationship" | "cluster" | "prediction";
  title: string;
  description: string;
  data: {
    type: string;
    value: any;
    confidence?: number;
  };
  insights: Array<{
    type: "cost_reduction" | "revenue_increase" | "operational_improvement";
    title: string;
    description: string;
    impact?: number;  // Estimated financial impact
    confidence: number;
  }>;
  visualizationType?: "chart" | "graph" | "table" | "map";
  visualizationConfig?: Record<string, any>;
  processedAt: string;
  createdAt: string;
}