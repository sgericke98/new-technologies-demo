import { useAuth } from '@/contexts/AuthContext';
import { logAuditEvent, createAuditLogData, AUDIT_ACTIONS, AUDIT_ENTITIES } from '@/lib/audit';

export function useAudit() {
  const { user } = useAuth();

  const logEvent = async (
    action: string,
    entity: string,
    entityId?: string,
    before?: any,
    after?: any
  ) => {
    if (!user?.id) {
      return;
    }

    try {
      const auditData = createAuditLogData(
        user.id,
        action,
        entity,
        entityId,
        before,
        after
      );
      
      await logAuditEvent(auditData);
    } catch (error) {
      // Silently handle audit logging errors
    }
  };

  const logCreate = async (entity: string, entityId: string, data: any) => {
    await logEvent(AUDIT_ACTIONS.CREATE, entity, entityId, null, data);
  };

  const logUpdate = async (entity: string, entityId: string, before: any, after: any) => {
    await logEvent(AUDIT_ACTIONS.UPDATE, entity, entityId, before, after);
  };

  const logDelete = async (entity: string, entityId: string, data: any) => {
    await logEvent(AUDIT_ACTIONS.DELETE, entity, entityId, data, null);
  };

  const logPin = async (entityId: string, data: any) => {
    await logEvent(AUDIT_ACTIONS.PIN, AUDIT_ENTITIES.RELATIONSHIP, entityId, null, data);
  };

  const logUnpin = async (entityId: string, data: any) => {
    await logEvent(AUDIT_ACTIONS.UNPIN, AUDIT_ENTITIES.RELATIONSHIP, entityId, data, null);
  };

  const logAssign = async (entityId: string, data: any) => {
    await logEvent(AUDIT_ACTIONS.ASSIGN, AUDIT_ENTITIES.RELATIONSHIP, entityId, null, data);
  };

  const logUnassign = async (entityId: string, data: any) => {
    await logEvent(AUDIT_ACTIONS.UNASSIGN, AUDIT_ENTITIES.RELATIONSHIP, entityId, data, null);
  };

  const logApprove = async (entity: string, entityId: string, data: any) => {
    await logEvent(AUDIT_ACTIONS.APPROVE, entity, entityId, null, data);
  };

  const logReject = async (entity: string, entityId: string, data: any) => {
    await logEvent(AUDIT_ACTIONS.REJECT, entity, entityId, null, data);
  };

  const logSettingsUpdate = async (entityId: string, before: any, after: any) => {
    await logEvent(AUDIT_ACTIONS.SETTINGS_UPDATE, AUDIT_ENTITIES.SETTINGS, entityId, before, after);
  };

  return {
    logEvent,
    logCreate,
    logUpdate,
    logDelete,
    logPin,
    logUnpin,
    logAssign,
    logUnassign,
    logApprove,
    logReject,
    logSettingsUpdate,
  };
}
