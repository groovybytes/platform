import { hasPermission, withPermission, canRead, canDelete, type PermissionDeniedError } from "./permissions";

// Example usage:
const rolePermissions = [
  "data:read",
  "data:write",
  "!data:delete",
  "billing:*",
  "*:preview",
  "admin:read"
];

// Basic boolean check (has function)
console.log("Has permission to read data?", hasPermission(rolePermissions, "data:read")); // true

// Multiple permissions with different match types
console.log(
  "Has ALL required permissions?",
  hasPermission(rolePermissions, ["data:read", "billing:update"], { match: 'all' })
); // true

console.log(
  "Has ANY of these permissions?",
  hasPermission(rolePermissions, ["data:delete", "billing:read"])
); // true (default is 'any')

// Using throw mode
try {
  withPermission(rolePermissions, "data:delete", {
    errorMessage: "You cannot delete data!"
  });
} catch (error) {
  console.log((error as PermissionDeniedError).message); // "You cannot delete data!"
}

// Using convenience methods
console.log("Can read data?", canRead(rolePermissions, "data")); // true
console.log("Can delete data?", canDelete(rolePermissions, "data")); // false

// Using convenience methods with throw mode
try {
  canDelete(rolePermissions, "data", {
    mode: 'throw',
    errorMessage: "Delete operation not allowed"
  });
} catch (error) {
  console.log((error as PermissionDeniedError).message); // "Delete operation not allowed"
}

// Check multiple different operations using one call
try {
  withPermission(
    rolePermissions,
    ["data:read", "data:write", "data:delete"],
    {
      match: 'all',
      errorMessage: "You need all permissions to proceed"
    }
  );
} catch (error) {
  console.log((error as PermissionDeniedError).message); // Contains info about denied permissions
}