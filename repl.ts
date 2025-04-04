// groovybytes-sample-data-generator.ts
import { ensureDir, ensureFile } from "https://deno.land/std/fs/mod.ts";
import { faker } from "https://deno.land/x/deno_faker@v1.0.3/mod.ts";

// Configuration
const PROJECT_ID = "capstone";
const WORKSPACE_ID = "main-workspace";
const USER_ID = "owner-user";
const OUTPUT_DIR = "./groovybytes-sample-data";
const NUM_USERS = 15;
const NUM_TEAMS = 3;
const NUM_DEVICES = 25;
const NUM_ASSETS = 20;
const NUM_NOTIFICATIONS = 30;
const NUM_RAW_DATA_ENTRIES = 50;
const NUM_ENRICHED_DATA_ENTRIES = 40;
const NUM_PROCESSED_DATA_ENTRIES = 15;
const NUM_ANALYSIS_JOBS = 10;
const OWNER_ENTRAID = "b71fd123-d9f1-45c8-b8e7-2ff40be2a052";

// Helper functions
function generateTimestamps(createdBy = USER_ID) {
  const createdAt = faker.date.past(1).toISOString();
  const modifiedAt = faker.date.between(new Date(createdAt), new Date()).toISOString();
  return {
    createdAt,
    createdBy,
    modifiedAt,
    modifiedBy: faker.helpers.arrayElement([createdBy, "system"]),
  };
}

function generateId() {
  return faker.string.uuid();
}

// Generate sample data for each entity type
async function generateSampleData() {
  console.log("Generating sample data for GroovyBytes platform...");
  
  await ensureDir(OUTPUT_DIR);
  
  // Generate a list of users first to reference in other entities
  const users = generateUsers();
  const userIds = users.map(user => user.id);
  
  // Generate all entity data
  await Promise.all([
    writeJsonToFile("users", users),
    writeJsonToFile("workspaces", generateWorkspaces()),
    writeJsonToFile("teams", generateTeams(userIds)),
    writeJsonToFile("projects", generateProjects()),
    writeJsonToFile("memberships", generateMemberships(userIds)),
    writeJsonToFile("onboarding", generateOnboardingStatus(userIds)),
    writeJsonToFile("roles", generateRoleDefinitions()),
    writeJsonToFile("assigned-roles", generateAssignedRoles(userIds)),
    writeJsonToFile("role-exceptions", generateRoleExceptions(userIds)),
    writeJsonToFile("api-keys", generateApiKeys()),
    writeJsonToFile("devices", generateDevices()),
    writeJsonToFile("assets", generateAssets()),
    writeJsonToFile("notifications", generateNotifications()),
    writeJsonToFile("analysis-jobs", generateAnalysisJobs()),
    writeJsonToFile("raw-data", generateRawIotData()),
    writeJsonToFile("enriched-data", generateEnrichedData()),
    writeJsonToFile("processed-data", generateProcessedData()),
    writeJsonToFile("saved-queries", generateSavedQueries()),
  ]);
  
  console.log(`Sample data generated successfully in ${OUTPUT_DIR} directory`);
}

// Writers
async function writeJsonToFile(entityName, data) {
  const filePath = `${OUTPUT_DIR}/${entityName}.json`;
  await ensureFile(filePath);
  await Deno.writeTextFile(filePath, JSON.stringify(data, null, 2));
  console.log(`Generated ${data.length} ${entityName} records`);
}

// Data generators for each entity type
function generateUsers() {
  const owner = {
    id: USER_ID,
    entraId: OWNER_ENTRAID,
    name: "System Owner",
    status: "active",
    preferences: {
      language: "en-US",
      timezone: "America/Los_Angeles",
    },
    emails: {
      primary: "owner@groovybytes.com",
      all: ["owner@groovybytes.com"],
    },
    createdAt: new Date("2024-01-01").toISOString(),
    modifiedAt: new Date("2024-01-01").toISOString(),
  };
  
  const users = [owner];
  
  for (let i = 0; i < NUM_USERS; i++) {
    const firstName = faker.person.firstName();
    const lastName = faker.person.lastName();
    const email = faker.internet.email({firstName, lastName}).toLowerCase();
    
    users.push({
      id: generateId(),
      entraId: faker.string.uuid(),
      name: `${firstName} ${lastName}`,
      status: faker.helpers.arrayElement(["active", "active", "active", "pending", "inactive"]),
      preferences: {
        language: faker.helpers.arrayElement(["en-US", "es-ES", "fr-FR", "de-DE"]),
        timezone: faker.helpers.arrayElement([
          "America/Los_Angeles", 
          "America/New_York", 
          "Europe/London", 
          "Asia/Tokyo"
        ]),
      },
      emails: {
        primary: email,
        all: [email],
      },
      ...generateTimestamps(USER_ID),
    });
  }
  
  return users;
}

function generateWorkspaces() {
  const mainWorkspace = {
    id: WORKSPACE_ID,
    name: "GroovyBytes Demo",
    slug: "groovybytes-demo",
    type: "standard",
    status: "active",
    settings: {
      contentTypes: ["documents", "devices", "analytics"],
      defaultLocale: "en-US",
      supportedLocales: ["en-US", "es-ES", "fr-FR"],
      security: {
        mfa: true,
        ssoEnabled: true,
        ipAllowlist: [],
      },
      features: {
        experimentationEnabled: true,
        advancedAnalytics: true,
        aiAssistant: true,
      },
    },
    subscriptionId: "sub_123456789",
    projects: [PROJECT_ID],
    ...generateTimestamps(),
  };
  
  const agencyWorkspace = {
    id: generateId(),
    name: "GroovyBytes Agency",
    slug: "groovybytes-agency",
    type: "agency",
    status: "active",
    settings: {
      contentTypes: ["documents", "devices", "analytics"],
      defaultLocale: "en-US",
      supportedLocales: ["en-US", "es-ES", "fr-FR"],
      security: {
        mfa: true,
        ssoEnabled: true,
        ipAllowlist: [],
      },
      features: {
        experimentationEnabled: true,
        advancedAnalytics: true,
        aiAssistant: true,
      },
    },
    subscriptionId: "sub_987654321",
    agency: {
      managedWorkspaces: [
        {
          workspaceId: WORKSPACE_ID,
          addedAt: faker.date.recent().toISOString(),
          status: "active"
        }
      ]
    },
    projects: [],
    ...generateTimestamps(),
  };
  
  return [mainWorkspace, agencyWorkspace];
}

function generateTeams(userIds) {
  const teams = [];
  
  const teamNames = [
    "Executive Team", 
    "Analytics Team", 
    "Development Team"
  ];
  
  for (let i = 0; i < NUM_TEAMS; i++) {
    // Randomly select 3-7 users for this team
    const teamMembers = faker.helpers.arrayElements(
      userIds, 
      faker.number.int({min: 3, max: 7})
    );
    
    // Always ensure owner is in the first team
    if (i === 0 && !teamMembers.includes(USER_ID)) {
      teamMembers.push(USER_ID);
    }
    
    teams.push({
      id: generateId(),
      workspaceId: WORKSPACE_ID,
      name: teamNames[i],
      description: faker.company.catchPhrase(),
      members: teamMembers,
      ...generateTimestamps(),
    });
  }
  
  return teams;
}

function generateProjects() {
  return [{
    id: PROJECT_ID,
    workspaceId: WORKSPACE_ID,
    name: "Capstone Project",
    slug: "capstone",
    description: "Main demonstration project for GroovyBytes platform",
    status: "active",
    settings: {
      defaultLocale: "en-US",
      supportedLocales: ["en-US", "es-ES"],
      security: {
        ipAllowlist: [],
        allowedOrigins: ["https://demo.groovybytes.com", "https://app.groovybytes.com"],
      },
      features: {
        experimentationEnabled: true,
        advancedAnalytics: true,
        aiAssistant: true,
      },
    },
    ...generateTimestamps(),
  }];
}

function generateMemberships(userIds) {
  const memberships = [];
  
  // Add workspace memberships
  userIds.forEach(userId => {
    memberships.push({
      id: generateId(),
      userId,
      resourceType: "workspace",
      resourceId: WORKSPACE_ID,
      membershipType: userId === USER_ID ? "member" : faker.helpers.arrayElement(["member", "member", "guest"]),
      status: "active",
      joinedAt: faker.date.past(1).toISOString(),
      lastActiveAt: faker.date.recent().toISOString(),
      invitedAt: faker.date.past(1).toISOString(),
      invitedBy: USER_ID,
    });
  });
  
  // Add project memberships
  userIds.forEach(userId => {
    if (faker.number.int({min: 1, max: 10}) > 2) { // 80% chance of being in the project
      memberships.push({
        id: generateId(),
        userId,
        resourceType: "project",
        resourceId: PROJECT_ID,
        membershipType: userId === USER_ID ? "member" : faker.helpers.arrayElement(["member", "member", "guest"]),
        status: "active",
        joinedAt: faker.date.past(1).toISOString(),
        lastActiveAt: faker.date.recent().toISOString(),
        invitedAt: faker.date.past(1).toISOString(),
        invitedBy: USER_ID,
      });
    }
  });
  
  return memberships;
}

function generateRoleDefinitions() {
  return [
    {
      id: "role-owner",
      type: "role",
      name: "Owner",
      description: "Full administrative access to all resources",
      permissions: [
        "workspace:*:*:*:allow",
        "project:*:*:*:allow",
        "system:*:*:*:allow"
      ],
      resourceType: "system",
      resourceId: "*",
      status: "active",
      is_system_role: true,
      created_by: "system",
      created_at: new Date("2024-01-01").toISOString(),
      updated_at: new Date("2024-01-01").toISOString()
    },
    {
      id: "role-admin",
      type: "role",
      name: "Administrator",
      description: "Administrative access to workspace resources",
      permissions: [
        "workspace:*:*:*:allow",
        "project:*:*:*:allow",
        "system:*:configuration:read:allow"
      ],
      resourceType: "workspace",
      resourceId: "*",
      status: "active",
      is_system_role: true,
      created_by: "system",
      created_at: new Date("2024-01-01").toISOString(),
      updated_at: new Date("2024-01-01").toISOString()
    },
    {
      id: "role-member",
      type: "role",
      name: "Member",
      description: "Standard access to workspace resources",
      permissions: [
        "workspace:*:*:read:allow",
        "project:*:*:read:allow",
        "project:*:analysis:write:allow",
        "project:*:device:read:allow"
      ],
      resourceType: "workspace",
      resourceId: "*",
      status: "active",
      is_system_role: true,
      created_by: "system",
      created_at: new Date("2024-01-01").toISOString(),
      updated_at: new Date("2024-01-01").toISOString()
    },
    {
      id: "role-guest",
      type: "role",
      name: "Guest",
      description: "Limited access to specific resources",
      permissions: [
        "project:*:dashboard:read:allow",
        "project:*:analytics:read:allow"
      ],
      resourceType: "project",
      resourceId: "*",
      status: "active",
      is_system_role: true,
      created_by: "system",
      created_at: new Date("2024-01-01").toISOString(),
      updated_at: new Date("2024-01-01").toISOString()
    },
    {
      id: "role-analyst",
      type: "role",
      name: "Analyst",
      description: "Access to analytics features",
      permissions: [
        "project:*:analytics:*:allow",
        "project:*:dashboard:read:allow",
        "project:*:device:read:allow",
        "project:*:asset:read:allow"
      ],
      resourceType: "project",
      resourceId: "*",
      status: "active",
      is_system_role: false,
      created_by: USER_ID,
      created_at: new Date("2024-02-15").toISOString(),
      updated_at: new Date("2024-02-15").toISOString()
    }
  ];
}

function generateAssignedRoles(userIds) {
  const assignedRoles = [];
  
  // Assign owner role to the main user
  assignedRoles.push({
    id: generateId(),
    type: "assigned-roles",
    userId: USER_ID,
    roles: ["role-owner"],
    resourceId: "*",
    resourceType: "system",
    assigned_by: "system",
    assigned_at: new Date("2024-01-01").toISOString()
  });
  
  // Assign roles to other users
  userIds.forEach(userId => {
    if (userId !== USER_ID) {
      const roleOptions = [
        ["role-admin"],
        ["role-member"], 
        ["role-member"], 
        ["role-guest"], 
        ["role-guest", "role-analyst"]
      ];
      
      // Workspace role
      assignedRoles.push({
        id: generateId(),
        type: "assigned-roles",
        userId,
        roles: faker.helpers.arrayElement(roleOptions),
        resourceId: WORKSPACE_ID,
        resourceType: "workspace",
        assignment_type: faker.helpers.maybe(() => "guest", { probability: 0.3 }),
        assigned_by: USER_ID,
        assigned_at: faker.date.past(1).toISOString(),
        expires_at: faker.helpers.maybe(
          () => faker.date.future().toISOString(),
          { probability: 0.3 }
        )
      });
      
      // Project role (for some users)
      if (faker.datatype.boolean()) {
        assignedRoles.push({
          id: generateId(),
          type: "assigned-roles",
          userId,
          roles: faker.helpers.arrayElement([["role-analyst"], ["role-guest"]]),
          resourceId: PROJECT_ID,
          resourceType: "project",
          assignment_type: faker.helpers.maybe(() => "guest", { probability: 0.3 }),
          assigned_by: USER_ID,
          assigned_at: faker.date.past(1).toISOString(),
          expires_at: faker.helpers.maybe(
            () => faker.date.future().toISOString(),
            { probability: 0.3 }
          )
        });
      }
    }
  });
  
  return assignedRoles;
}

function generateRoleExceptions(userIds) {
  const exceptions = [];
  
  // Generate a few exceptions for selected users
  for (let i = 0; i < 3; i++) {
    const randomUserId = faker.helpers.arrayElement(
      userIds.filter(id => id !== USER_ID)
    );
    
    exceptions.push({
      id: generateId(),
      type: "role-exceptions",
      resourceId: randomUserId,
      resourceType: "user",
      permissions: [
        faker.helpers.arrayElement([
          "project:capstone:device:write:allow",
          "project:capstone:analytics:export:allow",
          "workspace:main-workspace:user:invite:allow"
        ])
      ],
      reason: faker.helpers.arrayElement([
        "Temporary access for special project",
        "Emergency backup access",
        "Specialized role for user expertise"
      ]),
      created_by: USER_ID,
      created_at: faker.date.past(1).toISOString(),
      expires_at: faker.date.future().toISOString()
    });
  }
  
  return exceptions;
}

function generateOnboardingStatus(userIds) {
  const onboardingRecords = [];
  
  userIds.forEach(userId => {
    if (userId !== USER_ID) { // Skip the owner
      const isCompleted = faker.datatype.boolean();
      
      onboardingRecords.push({
        id: generateId(),
        userId,
        type: faker.helpers.arrayElement(["invite", "new_workspace", "new_project"]),
        status: isCompleted ? "completed" : "in_progress",
        startedAt: faker.date.past(1).toISOString(),
        completedAt: isCompleted ? faker.date.recent().toISOString() : undefined,
        resourceId: faker.helpers.arrayElement([WORKSPACE_ID, PROJECT_ID]),
        resourceType: faker.helpers.arrayElement(["workspace", "project"]),
        orchestrationId: generateId(),
        steps: [
          {
            name: "account_setup",
            status: "completed",
            timestamp: faker.date.past(1).toISOString()
          },
          {
            name: "profile_completion",
            status: "completed",
            timestamp: faker.date.past(1).toISOString()
          },
          {
            name: "resource_access",
            status: isCompleted ? "completed" : "pending",
            timestamp: isCompleted ? faker.date.recent().toISOString() : undefined
          },
          {
            name: "tour_completion",
            status: isCompleted ? "completed" : "pending",
            timestamp: isCompleted ? faker.date.recent().toISOString() : undefined
          }
        ],
        createdAt: faker.date.past(1).toISOString(),
        modifiedAt: faker.date.recent().toISOString()
      });
    }
  });
  
  return onboardingRecords;
}

function generateApiKeys() {
  return [
    {
      id: generateId(),
      name: "Demo API Key",
      key: "hashed_api_key_value_123456789", // This would be properly hashed in a real system
      status: "active",
      permissions: [
        "project:capstone:device:read:allow",
        "project:capstone:analytics:read:allow"
      ],
      allowedOrigins: [
        "https://demo.groovybytes.com",
        "https://app.groovybytes.com"
      ],
      ipAllowlist: [
        "192.168.1.1/24"
      ],
      expiresAt: faker.date.future(1).toISOString(),
      lastUsedAt: faker.date.recent().toISOString(),
      ...generateTimestamps()
    },
    {
      id: generateId(),
      name: "Integration API Key",
      key: "hashed_api_key_value_987654321", 
      status: "active",
      permissions: [
        "project:capstone:device:write:allow",
        "project:capstone:analytics:read:allow"
      ],
      lastUsedAt: faker.date.recent().toISOString(),
      ...generateTimestamps()
    }
  ];
}

function generateDevices() {
  const devices = [];
  const deviceTypes = [
    "temperature", "humidity", "motion", "energy", "pressure", 
    "light", "co2", "occupancy", "water_flow", "door_sensor"
  ];
  
  const locations = [
    "Front Office", "Warehouse", "Conference Room", "Kitchen", 
    "Manufacturing Floor", "Server Room", "Lobby", "Retail Floor"
  ];
  
  for (let i = 0; i < NUM_DEVICES; i++) {
    const sensorType = faker.helpers.arrayElement(deviceTypes);
    
    devices.push({
      id: generateId(),
      projectId: PROJECT_ID,
      deviceName: `${faker.helpers.arrayElement(locations)} ${sensorType} sensor ${i + 1}`,
      sensorType,
      location: faker.helpers.arrayElement(locations),
      purpose: faker.helpers.arrayElement([
        "Energy monitoring", "Environmental monitoring", "Security", 
        "Asset tracking", "Occupancy detection", "Maintenance alert"
      ]),
      connectionString: `HostName=iothub.azure.com;DeviceId=${generateId()};SharedAccessKey=randomKey${i}`,
      status: faker.helpers.weightedArrayElement([
        { weight: 7, value: "connected" },
        { weight: 2, value: "disconnected" },
        { weight: 1, value: "error" }
      ]),
      processingState: faker.helpers.arrayElement([
        "active", "active", "active", "processing", "analyzing", "maintenance"
      ]),
      lastDataReceived: faker.date.recent().toISOString(),
      metadata: {
        manufacturer: faker.company.name(),
        model: `Model-${faker.string.alphanumeric(5)}`,
        firmwareVersion: `${faker.number.int({min: 1, max: 9})}.${faker.number.int({min: 0, max: 9})}.${faker.number.int({min: 0, max: 9})}`,
        installDate: faker.date.past(1).toISOString().split('T')[0]
      },
      ...generateTimestamps()
    });
  }
  
  return devices;
}

function generateAssets() {
  const assets = [];
  
  const assetTypes = [
    "application/pdf", "image/jpeg", "image/png", 
    "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/csv", "application/json", "text/plain"
  ];
  
  const assetNames = [
    "Monthly Financial Report", "Customer Survey Results", "Equipment Maintenance Log",
    "Inventory Count", "Marketing Campaign Results", "Energy Consumption Data",
    "Employee Feedback", "Product Specifications", "Sales Forecast"
  ];
  
  for (let i = 0; i < NUM_ASSETS; i++) {
    const type = faker.helpers.arrayElement(assetTypes);
    const name = `${faker.helpers.arrayElement(assetNames)} - ${faker.date.recent().toISOString().split('T')[0]}`;
    const extension = type.split('/')[1];
    
    assets.push({
      id: generateId(),
      projectId: PROJECT_ID,
      name,
      type,
      size: faker.number.int({min: 10000, max: 5000000}),
      url: `https://storage.groovybytes.com/${PROJECT_ID}/${generateId()}.${extension}`,
      status: faker.helpers.weightedArrayElement([
        { weight: 8, value: "active" },
        { weight: 1, value: "archived" },
        { weight: 1, value: "deleted" }
      ]),
      processingState: faker.helpers.weightedArrayElement([
        { weight: 6, value: "processed" },
        { weight: 1, value: "uploading" },
        { weight: 1, value: "validating" },
        { weight: 1, value: "enriching" },
        { weight: 1, value: "analyzing" },
        { weight: 1, value: "error" }
      ]),
      processingProgress: 100,
      processingDetails: {
        startedAt: faker.date.recent(3).toISOString(),
        completedAt: faker.date.recent(1).toISOString()
      },
      metadata: {
        author: faker.person.fullName(),
        created: faker.date.past().toISOString(),
        pages: type.includes("pdf") ? faker.number.int({min: 1, max: 50}) : undefined,
        keywords: faker.helpers.arrayElements(
          ["financial", "report", "analysis", "quarterly", "annual", "sales", "marketing", "inventory"],
          faker.number.int({min: 2, max: 5})
        )
      },
      ...generateTimestamps()
    });
  }
  
  return assets;
}

function generateNotifications() {
  const notifications = [];
  
  for (let i = 0; i < NUM_NOTIFICATIONS; i++) {
    const isRead = faker.datatype.boolean();
    const createdAt = faker.date.recent(7).toISOString();
    
    notifications.push({
      id: generateId(),
      projectId: PROJECT_ID,
      type: faker.helpers.arrayElement(["alert", "info", "warning", "success", "error"]),
      title: faker.helpers.arrayElement([
        "Device Connection Lost",
        "Analysis Complete",
        "New Insight Detected",
        "System Maintenance",
        "Anomaly Detected",
        "Document Processing Error",
        "Threshold Exceeded",
        "Battery Level Low"
      ]),
      message: faker.lorem.sentence(),
      source: faker.helpers.arrayElement(["system", "device", "analysis", "user"]),
      sourceId: generateId(),
      severity: faker.helpers.arrayElement(["low", "medium", "high", "critical"]),
      status: isRead ? 
        faker.helpers.arrayElement(["read", "acknowledged", "resolved", "dismissed"]) : 
        "unread",
      link: faker.datatype.boolean() ? {
        type: faker.helpers.arrayElement(["device", "asset", "analysis", "dashboard"]),
        id: generateId(),
        title: faker.lorem.words(3)
      } : undefined,
      notificationSent: true,
      notificationChannels: faker.helpers.arrayElements(
        ["email", "dashboard", "sms"],
        faker.number.int({min: 1, max: 3})
      ),
      expiresAt: faker.date.future().toISOString(),
      createdAt,
      readBy: isRead ? USER_ID : undefined,
      readAt: isRead ? faker.date.between(new Date(createdAt), new Date()).toISOString() : undefined,
    });
  }
  
  return notifications;
}

function generateRawIotData() {
  const rawData = [];
  
  // Get the list of device IDs to reference
  const deviceIds = Array(NUM_DEVICES).fill(0).map((_, i) => generateId());
  
  for (let i = 0; i < NUM_RAW_DATA_ENTRIES; i++) {
    const deviceId = faker.helpers.arrayElement(deviceIds);
    const timestamp = faker.date.recent(5).toISOString();
    
    // Create different data formats based on device type
    const deviceType = faker.helpers.arrayElement([
      "temperature", "humidity", "motion", "energy", "pressure"
    ]);
    
    let data = {};
    
    switch (deviceType) {
      case "temperature":
        data = {
          temperature: faker.number.float({min: 18, max: 28, precision: 0.1}),
          unit: "celsius",
          battery: faker.number.int({min: 30, max: 100})
        };
        break;
      case "humidity":
        data = {
          humidity: faker.number.float({min: 30, max: 80, precision: 0.1}),
          temperature: faker.number.float({min: 18, max: 28, precision: 0.1}),
          battery: faker.number.int({min: 30, max: 100})
        };
        break;
      case "motion":
        data = {
          motion: faker.datatype.boolean(),
          count: faker.number.int({min: 0, max: 10}),
          battery: faker.number.int({min: 30, max: 100})
        };
        break;
      case "energy":
        data = {
          power: faker.number.float({min: 0, max: 5000, precision: 0.1}),
          voltage: faker.number.float({min: 110, max: 240, precision: 0.1}),
          current: faker.number.float({min: 0, max: 20, precision: 0.01})
        };
        break;
      case "pressure":
        data = {
          pressure: faker.number.float({min: 980, max: 1030, precision: 0.1}),
          temperature: faker.number.float({min: 18, max: 28, precision: 0.1}),
          battery: faker.number.int({min: 30, max: 100})
        };
        break;
    }
    
    rawData.push({
      id: generateId(),
      projectId: PROJECT_ID,
      sourceId: deviceId,
      data,
      timestamp,
      receivedAt: faker.date.between(new Date(timestamp), new Date(new Date(timestamp).getTime() + 5000)).toISOString(),
      metadata: {
        deviceName: `${deviceType} sensor ${i % 10 + 1}`,
        sensorType: deviceType,
        location: faker.helpers.arrayElement([
          "Front Office", "Warehouse", "Conference Room", "Kitchen", 
          "Manufacturing Floor", "Server Room", "Lobby", "Retail Floor"
        ])
      }
    });
  }
  
  return rawData;
}

