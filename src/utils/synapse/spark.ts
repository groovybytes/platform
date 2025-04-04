// @filename: job-management/services/synapse-spark-service.ts
import type { SparkBatch, SparkBatchJob, SparkBatchJobCollection, SparkBatchJobOptions } from '@azure/synapse-spark';

import { DefaultAzureCredential } from '@azure/identity';
import { SparkClient } from '@azure/synapse-spark';

// Azure Synapse Workspace details
const SYNAPSE_WORKSPACE_NAME = process.env.SYNAPSE_WORKSPACE_NAME;
const SYNAPSE_ENDPOINT = process.env.SYNAPSE_ENDPOINT; // https://{workspace-name}.dev.azuresynapse.net
const SYNAPSE_SPARK_POOL_NAME = process.env.SYNAPSE_SPARK_POOL_NAME || 'groovybytes';

// Cache for Synapse Spark clients
let sparkBatchClient: SparkBatch | null = null;
let sparkClient: SparkClient | null = null;

/**
 * Spark job configuration
 */
export interface SparkJobConfig {
  jobId: string;
  jobName: string;
  file: string;
  className?: string;
  args?: string[];
  jars?: string[];
  pyFiles?: string[];
  files?: string[];
  configurations?: Record<string, string>;
  driverMemory?: string;
  driverCores?: number;
  executorMemory?: string;
  executorCores?: number;
  numExecutors?: number;
}

/**
 * Get a Synapse Spark client instance
 */
export async function getSparkClient(): Promise<SparkClient> {
  if (!sparkClient) {
    if (!SYNAPSE_ENDPOINT) {
      throw new Error('SYNAPSE_ENDPOINT environment variable is required');
    }

    if (!SYNAPSE_SPARK_POOL_NAME) {
      throw new Error('SYNAPSE_SPARK_POOL_NAME environment variable is required');
    }

    const credential = new DefaultAzureCredential();
    sparkClient = new SparkClient(credential, SYNAPSE_ENDPOINT, SYNAPSE_SPARK_POOL_NAME);
  }
  
  return sparkClient;
}

/**
 * Get a Synapse Spark batch client instance
 */
export async function getSparkBatchClient(): Promise<SparkBatch> {
  if (!sparkBatchClient) {
    const _sparkClient = await getSparkClient();
    sparkBatchClient = _sparkClient.sparkBatch;
  }
  
  return sparkBatchClient;
}


/**
 * Submit a Spark job to the Synapse Analytics Spark pool
 * @param config Spark job configuration
 */
export async function submitSparkJob(config: SparkJobConfig): Promise<SparkBatchJob> {
  try {
    const client = await getSparkBatchClient();
    
    // Default configurations for analysis jobs
    const defaultConfigs = {
      "spark.dynamicAllocation.enabled": "true",
      "spark.dynamicAllocation.minExecutors": "1",
      "spark.dynamicAllocation.maxExecutors": "4",
      "spark.autotune.trackingId": config.jobId,
      "spark.executor.cores": (config.executorCores || 2).toString()
    };
    
    // Prepare job options
    const jobOptions: SparkBatchJobOptions = {
      name: config.jobName,
      file: config.file,
      className: config.className,
      arguments: config.args,
      jars: config.jars,
      pythonFiles: config.pyFiles,
      files: config.files,
      configuration: { ...defaultConfigs, ...config.configurations },
      driverMemory: config.driverMemory || "4g",
      driverCores: config.driverCores || 2,
      executorMemory: config.executorMemory || "4g",
      executorCount: config.numExecutors || 2,
      executorCores: config.executorCores || 2,
    };
    
    // Submit job
    const job = await client.createSparkBatchJob(jobOptions);
    
    // Log job submission
    console.info(`Spark job submitted`, {
      jobId: config.jobId,
      sparkBatchId: job.id,
      name: config.jobName,
      state: job.state
    });
    
    return job;
  } catch (error) {
    console.error(`Error submitting Spark job`, {
      jobId: config.jobId,
      error: (error as Error)?.message
    });
    
    throw error;
  }
}

/**
 * Get the status of a Spark job
 * @param batchId Spark batch ID
 */
export async function getSparkJobStatus(batchId: number): Promise<SparkBatchJob> {
  try {
    const client = await getSparkBatchClient();
    
    return await client.getSparkBatchJob(batchId);
  } catch (error) {
    console.error(`Error getting Spark job status`, {
      batchId,
      error: (error as Error)?.message
    });
    
    throw error;
  }
}

/**
 * List all active Spark batch jobs
 */
export async function listActiveSparkJobs(): Promise<SparkBatchJobCollection> {
  try {
    const client = await getSparkBatchClient();
    
    return await client.getSparkBatchJobs();
  } catch (error) {
    console.error(`Error listing Spark jobs`, {
      error: (error as Error)?.message
    });
    
    throw error;
  }
}

/**
 * Cancel a running Spark job
 * @param batchId Spark batch ID
 */
export async function cancelSparkJob(batchId: number): Promise<void> {
  try {
    const client = await getSparkBatchClient();
    
    await client.cancelSparkBatchJob(batchId);
    
    console.info(`Spark job cancelled`, {
      batchId
    });
  } catch (error) {
    console.error(`Error cancelling Spark job`, {
      batchId,
      error: (error as Error)?.message
    });
    
    throw error;
  }
}

/**
 * Maps analysis types to Spark job configurations
 * @param analysisType Type of analysis to run
 * @param jobId Analysis job ID
 * @param projectId Project ID
 * @param configuration Job configuration
 */
export function getSparkJobConfigForAnalysis(
  analysisType: string,
  jobId: string,
  projectId: string,
  configuration: Record<string, any>
): SparkJobConfig {
  // Base path to ADLS where code is stored
  const dataLakeAccount = process.env.DATALAKE_ACCOUNT_NAME || 'groovybytesdl';
  const codeContainer = process.env.CODE_CONTAINER_NAME || 'notebooks';
  const baseFilePath = `abfss://${codeContainer}@${dataLakeAccount}.dfs.core.windows.net/analysis`;
  
  // Common JAR files needed for most analysis jobs
  const commonJars = [
    `abfss://${codeContainer}@${dataLakeAccount}.dfs.core.windows.net/jars/azure-cosmos-spark_3-4_2-12-4.19.1.jar`,
    `abfss://${codeContainer}@${dataLakeAccount}.dfs.core.windows.net/jars/groovybytes-common.jar`
  ];
  
  // Common Python files needed for most analysis jobs
  const commonPyFiles = [
    `abfss://${codeContainer}@${dataLakeAccount}.dfs.core.windows.net/python/groovybytes_common.py`
  ];
  
  // Default job configuration
  const baseConfig: SparkJobConfig = {
    jobId,
    jobName: `${analysisType}_${projectId}_${jobId}`,
    file: `${baseFilePath}/generic_analysis.py`,
    args: [projectId, jobId, JSON.stringify(configuration)],
    jars: commonJars,
    pyFiles: commonPyFiles,
    configurations: {
      "spark.driver.userClassPathFirst": "true",
      "spark.executor.userClassPathFirst": "true",
      "spark.sql.extensions": "com.azure.cosmos.spark.SparkSessionStateBuilderProvider",
      "spark.cosmos.connectionMode": "Gateway",
      "spark.cosmos.read.inferSchema.enabled": "true"
    }
  };
  
  // Customize based on analysis type
  switch (analysisType) {
    case 'clustering':
      return {
        ...baseConfig,
        file: `${baseFilePath}/clustering.py`,
        pyFiles: [...commonPyFiles, `${baseFilePath}/ml/clustering_utils.py`],
        executorMemory: "8g",
        driverMemory: "8g"
      };
    
    case 'pattern_detection':
      return {
        ...baseConfig,
        file: `${baseFilePath}/pattern_detection.py`,
        pyFiles: [...commonPyFiles, `${baseFilePath}/ml/pattern_detection_utils.py`],
        executorMemory: "8g"
      };
    
    case 'anomaly_detection':
      return {
        ...baseConfig,
        file: `${baseFilePath}/anomaly_detection.py`,
        pyFiles: [...commonPyFiles, `${baseFilePath}/ml/anomaly_detection_utils.py`]
      };
    
    case 'relationship_analysis':
      return {
        ...baseConfig,
        file: `${baseFilePath}/relationship_analysis.py`,
        pyFiles: [...commonPyFiles, `${baseFilePath}/ml/graph_utils.py`],
        executorMemory: "8g",
        numExecutors: 4
      };
    
    case 'forecasting':
      return {
        ...baseConfig,
        file: `${baseFilePath}/forecasting.py`,
        pyFiles: [...commonPyFiles, `${baseFilePath}/ml/forecasting_utils.py`],
        executorMemory: "8g",
        driverMemory: "8g"
      };
    
    case 'segmentation':
      return {
        ...baseConfig,
        file: `${baseFilePath}/segmentation.py`,
        pyFiles: [...commonPyFiles, `${baseFilePath}/ml/segmentation_utils.py`]
      };
      
    default:
      return baseConfig;
  }
}