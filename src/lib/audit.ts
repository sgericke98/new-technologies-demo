import { supabase } from '@/integrations/supabase/client';
import { Tables } from '@/integrations/supabase/types';

export type AuditLog = Tables<'audit_logs'>;

export interface AuditLogInsert {
  user_id: string;
  action: string;
  entity: string;
  entity_id?: string;
  before?: any;
  after?: any;
}

/**
 * Log an audit event to the database
 */
export async function logAuditEvent(auditData: AuditLogInsert): Promise<void> {
  try {
    const { error } = await supabase
      .from('audit_logs')
      .insert({
        user_id: auditData.user_id,
        action: auditData.action,
        entity: auditData.entity,
        entity_id: auditData.entity_id,
        before: auditData.before,
        after: auditData.after,
      });

    if (error) {
      console.error('Failed to log audit event:', error);
      throw error;
    }
  } catch (error) {
    console.error('Error logging audit event:', error);
    // Don't throw here to avoid breaking the main operation
  }
}

/**
 * Get audit logs with optional filtering
 */
export async function getAuditLogs(options: {
  entity?: string;
  entity_id?: string;
  user_id?: string;
  action?: string;
  limit?: number;
  offset?: number;
  order_by?: 'created_at' | 'action' | 'entity';
  order_direction?: 'asc' | 'desc';
} = {}): Promise<AuditLog[]> {
  let query = supabase
    .from('audit_logs')
    .select(`
      *,
      profiles:user_id (
        id,
        name,
        email,
        role
      )
    `);

  if (options.entity) {
    query = query.eq('entity', options.entity);
  }

  if (options.entity_id) {
    query = query.eq('entity_id', options.entity_id);
  }

  if (options.user_id) {
    query = query.eq('user_id', options.user_id);
  }

  if (options.action) {
    query = query.eq('action', options.action);
  }

  if (options.order_by) {
    query = query.order(options.order_by, { ascending: options.order_direction === 'asc' });
  } else {
    query = query.order('created_at', { ascending: false });
  }

  if (options.limit) {
    query = query.limit(options.limit);
  }

  if (options.offset) {
    query = query.range(options.offset, options.offset + (options.limit || 50) - 1);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Failed to fetch audit logs:', error);
    throw error;
  }

  return data || [];
}

/**
 * Get audit logs for a specific entity
 */
export async function getEntityAuditLogs(entity: string, entityId: string): Promise<AuditLog[]> {
  return getAuditLogs({
    entity,
    entity_id: entityId,
    limit: 50,
  });
}

/**
 * Get recent audit logs for dashboard
 */
export async function getRecentAuditLogs(limit: number = 10): Promise<AuditLog[]> {
  return getAuditLogs({
    limit,
  });
}

/**
 * Get audit statistics
 */
export async function getAuditStats(): Promise<{
  total_logs: number;
  logs_by_action: Record<string, number>;
  logs_by_entity: Record<string, number>;
  logs_by_user: Record<string, number>;
}> {
  const { data, error } = await supabase
    .from('audit_logs')
    .select('action, entity, user_id');

  if (error) {
    console.error('Failed to fetch audit stats:', error);
    throw error;
  }

  const logs = data || [];
  
  const stats = {
    total_logs: logs.length,
    logs_by_action: {} as Record<string, number>,
    logs_by_entity: {} as Record<string, number>,
    logs_by_user: {} as Record<string, number>,
  };

  logs.forEach(log => {
    stats.logs_by_action[log.action] = (stats.logs_by_action[log.action] || 0) + 1;
    stats.logs_by_entity[log.entity] = (stats.logs_by_entity[log.entity] || 0) + 1;
    stats.logs_by_user[log.user_id] = (stats.logs_by_user[log.user_id] || 0) + 1;
  });

  return stats;
}

/**
 * Helper function to create audit log data for common operations
 */
export function createAuditLogData(
  userId: string,
  action: string,
  entity: string,
  entityId?: string,
  before?: any,
  after?: any
): AuditLogInsert {
  return {
    user_id: userId,
    action,
    entity,
    entity_id: entityId,
    before,
    after,
  };
}

/**
 * Common audit actions
 */
export const AUDIT_ACTIONS = {
  CREATE: 'create',
  UPDATE: 'update',
  DELETE: 'delete',
  PIN: 'pin',
  UNPIN: 'unpin',
  ASSIGN: 'assign',
  UNASSIGN: 'unassign',
  APPROVE: 'approve',
  REJECT: 'reject',
  LOGIN: 'login',
  LOGOUT: 'logout',
  SETTINGS_UPDATE: 'settings_update',
  DATA_IMPORT: 'data_import',
  BOOK_FINALIZED: 'book_finalized',
  BOOK_UNFINALIZED: 'book_unfinalized',
} as const;

/**
 * Common audit entities
 */
export const AUDIT_ENTITIES = {
  SELLER: 'seller',
  ACCOUNT: 'account',
  RELATIONSHIP: 'relationship',
  REQUEST: 'request',
  SETTINGS: 'settings',
  USER: 'user',
  MANAGER: 'manager',
} as const;
