import { ApplicationError } from '../../foundation/domain/errors.js';

export class NotificationNotFoundError extends ApplicationError {
  constructor(notificationId: string) {
    super('NOTIFICATION_NOT_FOUND', `Notification ${notificationId} was not found`);
  }
}

export class NotificationTemplateNotFoundError extends ApplicationError {
  constructor(templateKey: string) {
    super('NOTIFICATION_TEMPLATE_NOT_FOUND', `Notification template ${templateKey} was not found`);
  }
}

export class NotificationTemplateDisabledError extends ApplicationError {
  constructor(templateKey: string) {
    super('NOTIFICATION_TEMPLATE_DISABLED', `Notification template ${templateKey} is disabled`);
  }
}

export class NotificationTemplateRenderError extends ApplicationError {
  constructor(message: string, missingVariables?: readonly string[]) {
    super('NOTIFICATION_TEMPLATE_RENDER_ERROR', message, { missingVariables });
  }
}

export class NotificationPreferenceInvalidError extends ApplicationError {
  constructor(message: string) {
    super('NOTIFICATION_PREFERENCE_INVALID', message);
  }
}
