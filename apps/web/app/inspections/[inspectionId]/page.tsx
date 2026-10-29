'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { TenantHeader } from '../../../components/tenant-header';
import {
  api,
  vehicleApi,
  type CurrentUserResponse,
  type InspectionRecord,
  type InspectionResponseResult,
  type InspectionTemplateRecord,
  type InspectionTemplateItemRecord,
} from '../../../lib/api-client';

interface LocalResponseState {
  templateItemId: string;
  response: InspectionResponseResult;
  comment: string;
}

export default function InspectionDetailPage() {
  const params = useParams();
  const inspectionId = String(params.inspectionId);

  const [inspection, setInspection] = useState<InspectionRecord | null>(null);
  const [template, setTemplate] = useState<InspectionTemplateRecord | null>(null);
  const [currentUser, setCurrentUser] = useState<CurrentUserResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Responses state for IN_PROGRESS checklist
  const [responses, setResponses] = useState<Record<string, LocalResponseState>>({});

  // Cancel dialog state
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [insp, user] = await Promise.all([
        api.fetchInspection(inspectionId),
        vehicleApi.fetchCurrentUser().catch(() => null),
      ]);
      setInspection(insp);
      setCurrentUser(user);

      const tmpl = await api.fetchInspectionTemplate(insp.templateId).catch(() => null);
      setTemplate(tmpl);

      // Initialize local response state for each template item
      const initial: Record<string, LocalResponseState> = {};
      if (tmpl?.items) {
        for (const item of tmpl.items) {
          const existing = insp.responses?.find((r) => r.templateItemId === item.id);
          initial[item.id] = {
            templateItemId: item.id,
            response: existing?.response ?? 'PASS',
            comment: existing?.comment ?? '',
          };
        }
      } else if (insp.responses) {
        for (const r of insp.responses) {
          initial[r.templateItemId] = {
            templateItemId: r.templateItemId,
            response: r.response,
            comment: r.comment ?? '',
          };
        }
      }
      setResponses(initial);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load inspection');
    } finally {
      setLoading(false);
    }
  }, [inspectionId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const canPerform = Boolean(currentUser?.permissions.includes('inspection.perform'));
  const canComplete = Boolean(currentUser?.permissions.includes('inspection.complete'));
  const canCancel = Boolean(currentUser?.permissions.includes('inspection.cancel'));

  const handleStart = async () => {
    if (!inspection) return;
    try {
      setActionLoading(true);
      setError(null);
      const updated = await api.startInspection(inspection.id, inspection.version);
      setInspection(updated);
      setSuccessMsg('Inspection started. Fill out the checklist below.');

      // Ensure local response state has all items from template
      if (template?.items) {
        setResponses((prev) => {
          const nextState: Record<string, LocalResponseState> = { ...prev };
          for (const item of template.items ?? []) {
            if (!nextState[item.id]) {
              nextState[item.id] = {
                templateItemId: item.id,
                response: 'PASS',
                comment: '',
              };
            }
          }
          return nextState;
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start inspection');
    } finally {
      setActionLoading(false);
    }
  };

  const setItemResponse = (templateItemId: string, resVal: InspectionResponseResult) => {
    setResponses((prev) => ({
      ...prev,
      [templateItemId]: {
        templateItemId,
        response: resVal,
        comment: prev[templateItemId]?.comment ?? '',
      },
    }));
  };

  const setItemComment = (templateItemId: string, commentVal: string) => {
    setResponses((prev) => ({
      ...prev,
      [templateItemId]: {
        templateItemId,
        response: prev[templateItemId]?.response ?? 'PASS',
        comment: commentVal,
      },
    }));
  };

  const handleSaveResponses = async () => {
    if (!inspection) return;
    try {
      setActionLoading(true);
      setError(null);
      const itemsToSave = template?.items ?? [];
      const responseArray = itemsToSave.map((item) => {
        const comment = responses[item.id]?.comment;
        return {
          templateItemId: item.id,
          response: responses[item.id]?.response ?? 'PASS',
          comment: comment ? comment.trim() : undefined,
        };
      });
      const updated = await api.saveInspectionResponses(inspection.id, {
        version: inspection.version,
        responses: responseArray,
      });
      setInspection(updated);
      setSuccessMsg('Responses saved successfully.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save responses');
    } finally {
      setActionLoading(false);
    }
  };

  const handleComplete = async () => {
    if (!inspection) return;
    try {
      setActionLoading(true);
      setError(null);

      // Save responses first if in progress to guarantee all template items have answers
      const itemsToSave = template?.items ?? [];
      const responseArray = itemsToSave.map((item) => {
        const comment = responses[item.id]?.comment;
        return {
          templateItemId: item.id,
          response: responses[item.id]?.response ?? 'PASS',
          comment: comment ? comment.trim() : undefined,
        };
      });

      let currentVersion = inspection.version;
      if (responseArray.length > 0) {
        const saved = await api.saveInspectionResponses(inspection.id, {
          version: currentVersion,
          responses: responseArray,
        });
        currentVersion = saved.version;
      }

      const completed = await api.completeInspection(inspection.id, currentVersion);
      setInspection(completed);
      setSuccessMsg(`Inspection completed. Result: ${completed.result}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to complete inspection');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!inspection || !cancelReason.trim()) return;
    try {
      setActionLoading(true);
      setError(null);
      const cancelled = await api.cancelInspection(inspection.id, {
        version: inspection.version,
        cancelReason: cancelReason.trim(),
      });
      setInspection(cancelled);
      setShowCancelModal(false);
      setSuccessMsg('Inspection was cancelled.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel inspection');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <main className="vehicle-page">
        <TenantHeader />
        <div style={{ textAlign: 'center', padding: '3rem', color: '#64748b' }}>
          Loading inspection...
        </div>
      </main>
    );
  }

  if (!inspection) {
    return (
      <main className="vehicle-page">
        <TenantHeader />
        <div style={{ textAlign: 'center', padding: '3rem', color: '#991b1b' }}>
          Inspection not found.
        </div>
      </main>
    );
  }

  return (
    <main className="vehicle-page">
      <TenantHeader onAuthChange={() => void loadData()} />

      <div style={{ maxWidth: '900px', margin: '0 auto' }}>
        <div style={{ marginBottom: '1.5rem' }}>
          <Link
            href="/inspections"
            style={{ color: '#1a56db', textDecoration: 'none', fontSize: '0.875rem' }}
          >
            ← Back to Inspections
          </Link>

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              marginTop: '0.5rem',
              flexWrap: 'wrap',
              gap: '1rem',
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <h1 style={{ fontSize: '1.75rem', fontWeight: 600 }} data-testid="inspection-id">
                  {inspection.displayId}
                </h1>
                <span
                  style={{
                    fontSize: '0.8125rem',
                    padding: '0.25rem 0.6rem',
                    borderRadius: '4px',
                    fontWeight: 700,
                    background:
                      inspection.status === 'COMPLETED'
                        ? '#dcfce7'
                        : inspection.status === 'IN_PROGRESS'
                          ? '#dbeafe'
                          : inspection.status === 'DRAFT'
                            ? '#fef9c3'
                            : '#f1f5f9',
                    color:
                      inspection.status === 'COMPLETED'
                        ? '#166534'
                        : inspection.status === 'IN_PROGRESS'
                          ? '#1e40af'
                          : inspection.status === 'DRAFT'
                            ? '#854d0e'
                            : '#475569',
                  }}
                  data-testid="inspection-status-badge"
                >
                  {inspection.status}
                </span>

                {inspection.result && (
                  <span
                    style={{
                      fontSize: '0.8125rem',
                      padding: '0.25rem 0.6rem',
                      borderRadius: '4px',
                      fontWeight: 700,
                      background: inspection.result === 'PASS' ? '#dcfce7' : '#fee2e2',
                      color: inspection.result === 'PASS' ? '#166534' : '#991b1b',
                    }}
                    data-testid="inspection-result-badge"
                  >
                    {inspection.result}
                  </span>
                )}

                {inspection.hasCriticalFailure && (
                  <span
                    style={{
                      fontSize: '0.75rem',
                      padding: '0.25rem 0.5rem',
                      borderRadius: '4px',
                      fontWeight: 700,
                      background: '#ef4444',
                      color: '#fff',
                    }}
                    data-testid="critical-failure-banner"
                  >
                    CRITICAL FAILURE DETECTED
                  </span>
                )}
              </div>

              <div style={{ color: '#64748b', fontSize: '0.875rem', marginTop: '0.4rem' }}>
                Type: <strong>{inspection.type}</strong> | Template:{' '}
                <strong>{inspection.template?.name}</strong> | Version: v{inspection.version}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem' }}>
              {inspection.status === 'DRAFT' && canPerform && (
                <button
                  type="button"
                  onClick={() => void handleStart()}
                  disabled={actionLoading}
                  data-testid="start-inspection-button"
                  style={{
                    padding: '0.5rem 1.25rem',
                    background: '#1a56db',
                    color: '#fff',
                    borderRadius: '4px',
                    border: 'none',
                    fontWeight: 600,
                    cursor: actionLoading ? 'not-allowed' : 'pointer',
                  }}
                >
                  {actionLoading ? 'Starting...' : 'Start Inspection'}
                </button>
              )}

              {inspection.status === 'IN_PROGRESS' && (
                <>
                  {canPerform && (
                    <button
                      type="button"
                      onClick={() => void handleSaveResponses()}
                      disabled={actionLoading}
                      data-testid="save-responses-button"
                      style={{
                        padding: '0.5rem 1rem',
                        background: '#f1f5f9',
                        color: '#334155',
                        borderRadius: '4px',
                        border: '1px solid #cbd5e1',
                        fontWeight: 600,
                        cursor: actionLoading ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {actionLoading ? 'Saving...' : 'Save Responses'}
                    </button>
                  )}

                  {canComplete && (
                    <button
                      type="button"
                      onClick={() => void handleComplete()}
                      disabled={actionLoading}
                      data-testid="complete-inspection-button"
                      style={{
                        padding: '0.5rem 1.25rem',
                        background: '#16a34a',
                        color: '#fff',
                        borderRadius: '4px',
                        border: 'none',
                        fontWeight: 600,
                        cursor: actionLoading ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {actionLoading ? 'Completing...' : 'Complete Inspection'}
                    </button>
                  )}
                </>
              )}

              {(inspection.status === 'DRAFT' || inspection.status === 'IN_PROGRESS') &&
                canCancel && (
                  <button
                    type="button"
                    onClick={() => setShowCancelModal(true)}
                    disabled={actionLoading}
                    data-testid="cancel-inspection-button"
                    style={{
                      padding: '0.5rem 1rem',
                      background: '#fff',
                      color: '#dc2626',
                      borderRadius: '4px',
                      border: '1px solid #fca5a5',
                      fontWeight: 600,
                      cursor: actionLoading ? 'not-allowed' : 'pointer',
                    }}
                  >
                    Cancel
                  </button>
                )}
            </div>
          </div>
        </div>

        {error && (
          <div
            className="error-banner"
            data-testid="error-banner"
            style={{
              background: '#fef2f2',
              border: '1px solid #f87171',
              color: '#991b1b',
              padding: '0.75rem 1rem',
              borderRadius: '6px',
              marginBottom: '1rem',
            }}
          >
            {error}
          </div>
        )}

        {successMsg && (
          <div
            data-testid="success-banner"
            style={{
              background: '#f0fdf4',
              border: '1px solid #86efac',
              color: '#166534',
              padding: '0.75rem 1rem',
              borderRadius: '6px',
              marginBottom: '1rem',
            }}
          >
            {successMsg}
          </div>
        )}

        {/* Cancellation Notice */}
        {inspection.status === 'CANCELLED' && (
          <div
            data-testid="cancelled-banner"
            style={{
              background: '#fef2f2',
              border: '1px solid #f87171',
              borderRadius: '6px',
              padding: '1rem',
              marginBottom: '1.5rem',
            }}
          >
            <div style={{ fontWeight: 600, color: '#991b1b' }}>Inspection Cancelled</div>
            <div style={{ color: '#7f1d1d', marginTop: '0.25rem', fontSize: '0.875rem' }}>
              Reason: {inspection.cancelReason ?? 'No reason provided'}
            </div>
          </div>
        )}

        {/* Vehicle & Trip Association Info Card */}
        <div
          style={{
            background: '#fff',
            borderRadius: '8px',
            border: '1px solid #e2e8f0',
            padding: '1.25rem',
            marginBottom: '1.5rem',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '1rem',
          }}
        >
          <div>
            <div
              style={{
                fontSize: '0.75rem',
                color: '#64748b',
                textTransform: 'uppercase',
                fontWeight: 600,
              }}
            >
              Vehicle
            </div>
            <div style={{ marginTop: '0.25rem', fontWeight: 600 }}>
              <Link
                href={`/vehicles/${inspection.vehicle.id}`}
                style={{ color: '#1a56db', textDecoration: 'none' }}
              >
                {inspection.vehicle.displayId} ({inspection.vehicle.registration})
              </Link>
            </div>
            <div style={{ fontSize: '0.8125rem', color: '#64748b' }}>
              {inspection.vehicle.model} • {inspection.vehicle.odometerKm} km
            </div>
          </div>

          <div>
            <div
              style={{
                fontSize: '0.75rem',
                color: '#64748b',
                textTransform: 'uppercase',
                fontWeight: 600,
              }}
            >
              Driver / Performer
            </div>
            <div style={{ marginTop: '0.25rem', fontWeight: 600 }}>
              {inspection.driver ? (
                <Link
                  href={`/drivers/${inspection.driver.id}`}
                  style={{ color: '#1a56db', textDecoration: 'none' }}
                >
                  {inspection.driver.firstName} {inspection.driver.lastName} (
                  {inspection.driver.displayId})
                </Link>
              ) : (
                <span style={{ color: '#94a3b8' }}>Unassigned Driver</span>
              )}
            </div>
          </div>

          <div>
            <div
              style={{
                fontSize: '0.75rem',
                color: '#64748b',
                textTransform: 'uppercase',
                fontWeight: 600,
              }}
            >
              Trip Association
            </div>
            <div style={{ marginTop: '0.25rem', fontWeight: 600 }}>
              {inspection.trip ? (
                <Link
                  href={`/trips/${inspection.trip.id}`}
                  style={{ color: '#1a56db', textDecoration: 'none' }}
                >
                  {inspection.trip.displayId} ({inspection.trip.status})
                </Link>
              ) : (
                <span style={{ color: '#94a3b8' }}>Standalone Inspection</span>
              )}
            </div>
            {inspection.trip && (
              <div style={{ fontSize: '0.8125rem', color: '#64748b' }}>
                {inspection.trip.origin} → {inspection.trip.destination}
              </div>
            )}
          </div>
        </div>

        {/* Checklist Responses Card */}
        <div
          style={{
            background: '#fff',
            borderRadius: '8px',
            border: '1px solid #e2e8f0',
            padding: '1.5rem',
          }}
        >
          <h2 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '1rem' }}>
            Checklist Items & Responses
          </h2>

          {inspection.status === 'DRAFT' ? (
            <div
              style={{
                textAlign: 'center',
                padding: '2rem',
                background: '#f8fafc',
                borderRadius: '6px',
                border: '1px dashed #cbd5e1',
              }}
            >
              <p style={{ color: '#64748b' }}>
                This inspection is currently in <strong>DRAFT</strong> status. Click &quot;Start
                Inspection&quot; to begin filling out the checklist.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {(template?.items ?? []).map((item: InspectionTemplateItemRecord, idx: number) => {
                const local = responses[item.id] ?? {
                  templateItemId: item.id,
                  response: 'PASS',
                  comment: '',
                };
                const isEditable = inspection.status === 'IN_PROGRESS';

                return (
                  <div
                    key={item.id}
                    data-testid={`response-item-${item.id}`}
                    style={{
                      padding: '1rem',
                      border: '1px solid #e2e8f0',
                      borderRadius: '6px',
                      background: local.response === 'FAIL' ? '#fff5f5' : '#fafafa',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.75rem',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                      }}
                    >
                      <div>
                        <span
                          style={{
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            color: '#64748b',
                            textTransform: 'uppercase',
                          }}
                        >
                          Item #{idx + 1} • {item.category}
                        </span>
                        <div
                          style={{ fontSize: '0.9375rem', fontWeight: 500, marginTop: '0.2rem' }}
                        >
                          {item.prompt}
                        </div>
                        {item.description && (
                          <div
                            style={{ fontSize: '0.8125rem', color: '#64748b', marginTop: '0.2rem' }}
                          >
                            {item.description}
                          </div>
                        )}
                      </div>

                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <span
                          style={{
                            fontSize: '0.7rem',
                            padding: '0.15rem 0.4rem',
                            borderRadius: '3px',
                            fontWeight: 700,
                            background: item.severity === 'CRITICAL' ? '#fee2e2' : '#f1f5f9',
                            color: item.severity === 'CRITICAL' ? '#991b1b' : '#475569',
                          }}
                        >
                          {item.severity}
                        </span>
                        {item.required && (
                          <span style={{ fontSize: '0.7rem', color: '#dc2626', fontWeight: 700 }}>
                            *REQUIRED
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Radio Options */}
                    <div
                      style={{
                        display: 'flex',
                        gap: '1.5rem',
                        alignItems: 'center',
                        marginTop: '0.25rem',
                      }}
                    >
                      <label
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                          cursor: isEditable ? 'pointer' : 'default',
                          fontWeight: 500,
                          color: '#166534',
                          fontSize: '0.875rem',
                        }}
                      >
                        <input
                          type="radio"
                          name={`response-${item.id}`}
                          value="PASS"
                          checked={local.response === 'PASS'}
                          disabled={!isEditable}
                          onChange={() => setItemResponse(item.id, 'PASS')}
                          data-testid={`response-pass-${item.id}`}
                        />
                        PASS
                      </label>

                      <label
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                          cursor: isEditable ? 'pointer' : 'default',
                          fontWeight: 500,
                          color: '#991b1b',
                          fontSize: '0.875rem',
                        }}
                      >
                        <input
                          type="radio"
                          name={`response-${item.id}`}
                          value="FAIL"
                          checked={local.response === 'FAIL'}
                          disabled={!isEditable}
                          onChange={() => setItemResponse(item.id, 'FAIL')}
                          data-testid={`response-fail-${item.id}`}
                        />
                        FAIL
                      </label>

                      <label
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                          cursor: isEditable ? 'pointer' : 'default',
                          fontWeight: 500,
                          color: '#64748b',
                          fontSize: '0.875rem',
                        }}
                      >
                        <input
                          type="radio"
                          name={`response-${item.id}`}
                          value="NOT_APPLICABLE"
                          checked={local.response === 'NOT_APPLICABLE'}
                          disabled={!isEditable}
                          onChange={() => setItemResponse(item.id, 'NOT_APPLICABLE')}
                          data-testid={`response-na-${item.id}`}
                        />
                        N/A
                      </label>
                    </div>

                    {/* Comment Input */}
                    {(isEditable || local.comment) && (
                      <div style={{ marginTop: '0.25rem' }}>
                        <input
                          type="text"
                          placeholder={
                            isEditable ? 'Add comment or describe defect if failed...' : ''
                          }
                          value={local.comment}
                          disabled={!isEditable}
                          onChange={(e) => setItemComment(item.id, e.target.value)}
                          data-testid={`response-comment-${item.id}`}
                          style={{
                            width: '100%',
                            padding: '0.4rem 0.6rem',
                            borderRadius: '4px',
                            border: '1px solid #cbd5e1',
                            fontSize: '0.8125rem',
                            background: isEditable ? '#fff' : '#f8fafc',
                          }}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Cancel Modal */}
      {showCancelModal && (
        <div
          data-testid="cancel-modal"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50,
          }}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: '8px',
              padding: '1.5rem',
              maxWidth: '480px',
              width: '90%',
            }}
          >
            <h3 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Cancel Inspection</h3>
            <p style={{ color: '#64748b', fontSize: '0.875rem', marginTop: '0.5rem' }}>
              Please provide a required reason for cancelling this inspection. This action cannot be
              undone.
            </p>

            <div style={{ marginTop: '1rem' }}>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.8125rem',
                  fontWeight: 500,
                  marginBottom: '0.25rem',
                }}
              >
                Cancellation Reason *
              </label>
              <textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="e.g. Driver reassigned before inspection commenced..."
                rows={3}
                data-testid="cancel-reason-input"
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  borderRadius: '4px',
                  border: '1px solid #cbd5e1',
                }}
              />
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '0.75rem',
                marginTop: '1.25rem',
              }}
            >
              <button
                type="button"
                onClick={() => setShowCancelModal(false)}
                style={{
                  padding: '0.5rem 1rem',
                  borderRadius: '4px',
                  border: '1px solid #cbd5e1',
                  background: '#fff',
                  cursor: 'pointer',
                }}
              >
                Close
              </button>
              <button
                type="button"
                disabled={!cancelReason.trim() || actionLoading}
                onClick={() => void handleCancel()}
                data-testid="confirm-cancel-button"
                style={{
                  padding: '0.5rem 1rem',
                  borderRadius: '4px',
                  background: '#dc2626',
                  color: '#fff',
                  border: 'none',
                  fontWeight: 600,
                  cursor: !cancelReason.trim() || actionLoading ? 'not-allowed' : 'pointer',
                }}
              >
                {actionLoading ? 'Cancelling...' : 'Confirm Cancellation'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
