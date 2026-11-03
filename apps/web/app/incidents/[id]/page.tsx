'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { TenantHeader } from '../../../components/tenant-header';
import {
  incidentApi,
  vehicleApi,
  type CurrentUserResponse,
  type IncidentAttachmentRecord,
  type IncidentAttachmentType,
  type IncidentNoteRecord,
  type IncidentOperationalImpact,
  type IncidentRecord,
  type IncidentSeverity,
  type IncidentStatus,
} from '../../../lib/api-client';

export default function IncidentDetailPage() {
  const params = useParams();
  const incidentId = params?.id as string;

  const [incident, setIncident] = useState<IncidentRecord | null>(null);
  const [currentUser, setCurrentUser] = useState<CurrentUserResponse | null>(null);
  const [notes, setNotes] = useState<IncidentNoteRecord[]>([]);
  const [attachments, setAttachments] = useState<IncidentAttachmentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // New Note state
  const [newNoteBody, setNewNoteBody] = useState('');
  const [submittingNote, setSubmittingNote] = useState(false);

  // Attachment upload state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [attachmentType, setAttachmentType] = useState<IncidentAttachmentType>('DOCUMENT');
  const [attachmentDescription, setAttachmentDescription] = useState('');
  const [uploadingAttachment, setUploadingAttachment] = useState(false);

  // Modals state
  const [showResolveModal, setShowResolveModal] = useState(false);
  const [resolutionSummary, setResolutionSummary] = useState('');
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancellationReason, setCancellationReason] = useState('');
  const [modalLoading, setModalLoading] = useState(false);

  // Maintenance request creation
  const [creatingMaintenance, setCreatingMaintenance] = useState(false);

  const loadData = useCallback(async () => {
    if (!incidentId) return;
    try {
      setLoading(true);
      setError(null);
      const [inc, user, noteList, attList] = await Promise.all([
        incidentApi.fetchIncident(incidentId),
        vehicleApi.fetchCurrentUser().catch(() => null),
        incidentApi.fetchIncidentNotes(incidentId).catch(() => []),
        incidentApi.fetchIncidentAttachments(incidentId).catch(() => []),
      ]);
      setIncident(inc);
      setCurrentUser(user);
      setNotes(noteList);
      setAttachments(attList);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load incident');
    } finally {
      setLoading(false);
    }
  }, [incidentId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Permissions
  const hasPermission = (perm: string) => {
    if (!currentUser) return true; // dev default
    return currentUser.permissions.includes(perm);
  };

  const canInvestigate = hasPermission('incident.investigate');
  const canResolve = hasPermission('incident.resolve');
  const canClose = hasPermission('incident.close');
  const canCancel = hasPermission('incident.cancel');
  const canAddNote = hasPermission('incident.note.create');
  const canUpload = hasPermission('incident.attachment.upload');
  const canDownload = hasPermission('incident.attachment.download');
  const canCreateMaintenance =
    hasPermission('incident.update') && hasPermission('maintenance.request.create');

  // Actions
  const handleStartInvestigation = async () => {
    if (!incident) return;
    try {
      setLoading(true);
      setError(null);
      const updated = await incidentApi.startIncidentInvestigation(incident.id, incident.version);
      setIncident(updated);
      setActionSuccess('Investigation formally started.');
      void loadData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to start investigation');
    } finally {
      setLoading(false);
    }
  };

  const handleResolveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!incident) return;
    if (!resolutionSummary.trim()) {
      setError('Resolution summary is required.');
      return;
    }
    try {
      setModalLoading(true);
      setError(null);
      const updated = await incidentApi.resolveIncident(incident.id, {
        version: incident.version,
        resolutionSummary: resolutionSummary.trim(),
      });
      setIncident(updated);
      setShowResolveModal(false);
      setResolutionSummary('');
      setActionSuccess('Incident resolved successfully.');
      void loadData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to resolve incident');
    } finally {
      setModalLoading(false);
    }
  };

  const handleCloseIncident = async () => {
    if (!incident) return;
    try {
      setLoading(true);
      setError(null);
      const updated = await incidentApi.closeIncident(incident.id, incident.version);
      setIncident(updated);
      setActionSuccess('Incident administratively closed.');
      void loadData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to close incident');
    } finally {
      setLoading(false);
    }
  };

  const handleCancelSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!incident) return;
    if (!cancellationReason.trim()) {
      setError('Cancellation reason is required.');
      return;
    }
    try {
      setModalLoading(true);
      setError(null);
      const updated = await incidentApi.cancelIncident(incident.id, {
        version: incident.version,
        cancellationReason: cancellationReason.trim(),
      });
      setIncident(updated);
      setShowCancelModal(false);
      setCancellationReason('');
      setActionSuccess('Incident cancelled.');
      void loadData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to cancel incident');
    } finally {
      setModalLoading(false);
    }
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!incident || !newNoteBody.trim()) return;
    try {
      setSubmittingNote(true);
      setError(null);
      const added = await incidentApi.addIncidentNote(incident.id, newNoteBody.trim());
      setNotes((prev) => [...prev, added]);
      setNewNoteBody('');
      setActionSuccess('Note added to investigation thread.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to add note');
    } finally {
      setSubmittingNote(false);
    }
  };

  const handleUploadAttachment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!incident || !selectedFile) return;
    try {
      setUploadingAttachment(true);
      setError(null);
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('attachmentType', attachmentType);
      if (attachmentDescription.trim()) {
        formData.append('description', attachmentDescription.trim());
      }
      const uploaded = await incidentApi.uploadIncidentAttachment(incident.id, formData);
      setAttachments((prev) => [...prev, uploaded]);
      setSelectedFile(null);
      setAttachmentDescription('');
      setActionSuccess('Evidence attachment uploaded successfully to secure storage.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to upload attachment');
    } finally {
      setUploadingAttachment(false);
    }
  };

  const handleDownloadAttachment = async (attId: string, fileName: string) => {
    if (!incident) return;
    try {
      setError(null);
      const data = await incidentApi.getIncidentAttachmentDownloadUrl(incident.id, attId);
      const downloadUrl = data.downloadUrl || data.url;
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = fileName;
      a.target = '_blank';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to get download URL');
    }
  };

  const handleCreateMaintenanceRequest = async () => {
    if (!incident) return;
    try {
      setCreatingMaintenance(true);
      setError(null);
      const mr = await incidentApi.createIncidentMaintenanceRequest(incident.id, {
        title: `Repair from Incident ${incident.displayId}: ${incident.title}`,
        priority: incident.severity === 'CRITICAL' ? 'CRITICAL' : 'HIGH',
        blocksOperation:
          incident.operationalImpact === 'VEHICLE' || incident.operationalImpact === 'BOTH',
      });
      setActionSuccess(`Maintenance request ${mr.displayId} created successfully.`);
      void loadData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create maintenance request');
    } finally {
      setCreatingMaintenance(false);
    }
  };

  if (loading && !incident) {
    return (
      <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '1.5rem' }}>
        <TenantHeader />
        <p style={{ marginTop: '2rem', textAlign: 'center', color: '#6b7280' }}>
          Loading incident details...
        </p>
      </div>
    );
  }

  if (!incident) {
    return (
      <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '1.5rem' }}>
        <TenantHeader />
        <div
          style={{
            marginTop: '2rem',
            padding: '2rem',
            background: '#fee2e2',
            borderRadius: '8px',
            color: '#b91c1c',
          }}
        >
          <h3>Incident Not Found</h3>
          <p>The requested incident does not exist or you do not have permission to view it.</p>
          <Link href="/incidents" style={{ color: '#1d4ed8', fontWeight: 600 }}>
            &larr; Back to Incidents
          </Link>
        </div>
      </div>
    );
  }

  const isTerminal = incident.status === 'CLOSED' || incident.status === 'CANCELLED';

  const getSeverityStyle = (severity: IncidentSeverity) => {
    switch (severity) {
      case 'CRITICAL':
        return { background: '#fee2e2', color: '#991b1b', border: '1px solid #f87171' };
      case 'HIGH':
        return { background: '#ffedd5', color: '#9a3412', border: '1px solid #fb923c' };
      case 'MEDIUM':
        return { background: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d' };
      case 'LOW':
      default:
        return { background: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db' };
    }
  };

  const getStatusStyle = (status: IncidentStatus) => {
    switch (status) {
      case 'REPORTED':
        return { background: '#dbeafe', color: '#1e40af' };
      case 'INVESTIGATING':
        return { background: '#fef3c7', color: '#92400e' };
      case 'RESOLVED':
        return { background: '#d1fae5', color: '#065f46' };
      case 'CLOSED':
        return { background: '#e5e7eb', color: '#374151' };
      case 'CANCELLED':
        return { background: '#fee2e2', color: '#991b1b' };
      default:
        return { background: '#f3f4f6', color: '#374151' };
    }
  };

  const getImpactStyle = (impact: IncidentOperationalImpact) => {
    switch (impact) {
      case 'BOTH':
        return { background: '#fecaca', color: '#7f1d1d' };
      case 'VEHICLE':
      case 'DRIVER':
        return { background: '#fed7aa', color: '#7c2d12' };
      case 'NONE':
      default:
        return { background: '#f3f4f6', color: '#6b7280' };
    }
  };

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '1.5rem' }}>
      <TenantHeader onAuthChange={loadData} />

      <div style={{ marginTop: '1.5rem', marginBottom: '1.5rem' }}>
        <Link
          href="/incidents"
          style={{ color: '#4b5563', textDecoration: 'none', fontSize: '0.875rem' }}
        >
          &larr; Back to Incidents
        </Link>
      </div>

      {error && (
        <div
          style={{
            padding: '0.75rem 1rem',
            background: '#fee2e2',
            color: '#b91c1c',
            borderRadius: '6px',
            marginBottom: '1rem',
          }}
          data-testid="detail-error"
        >
          {error}
        </div>
      )}

      {actionSuccess && (
        <div
          style={{
            padding: '0.75rem 1rem',
            background: '#d1fae5',
            color: '#065f46',
            borderRadius: '6px',
            marginBottom: '1rem',
          }}
          data-testid="detail-success"
        >
          {actionSuccess}
        </div>
      )}

      {/* Header Card */}
      <div
        style={{
          background: '#fff',
          border: '1px solid #e5e7eb',
          borderRadius: '8px',
          padding: '1.5rem',
          marginBottom: '1.5rem',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            flexWrap: 'wrap',
            gap: '1rem',
          }}
        >
          <div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                flexWrap: 'wrap',
                marginBottom: '0.5rem',
              }}
            >
              <span
                style={{ fontSize: '1.5rem', fontWeight: 700, color: '#111827' }}
                data-testid="incident-display-id"
              >
                {incident.displayId}
              </span>
              <span
                style={{
                  padding: '0.25rem 0.6rem',
                  borderRadius: '4px',
                  fontSize: '0.8125rem',
                  fontWeight: 600,
                  ...getStatusStyle(incident.status),
                }}
                data-testid="status-badge"
              >
                {incident.status}
              </span>
              <span
                style={{
                  padding: '0.25rem 0.6rem',
                  borderRadius: '4px',
                  fontSize: '0.8125rem',
                  fontWeight: 600,
                  ...getSeverityStyle(incident.severity),
                }}
                data-testid="severity-badge"
              >
                {incident.severity}
              </span>
              <span
                style={{
                  padding: '0.25rem 0.6rem',
                  borderRadius: '4px',
                  fontSize: '0.8125rem',
                  fontWeight: 600,
                  ...getImpactStyle(incident.operationalImpact),
                }}
                data-testid="impact-badge"
              >
                Dispatch Impact: {incident.operationalImpact}
              </span>
            </div>
            <h2
              style={{
                fontSize: '1.25rem',
                fontWeight: 600,
                margin: '0 0 0.5rem 0',
                color: '#1f2937',
              }}
              data-testid="incident-title"
            >
              {incident.title}
            </h2>
            <p
              style={{ color: '#4b5563', margin: 0, fontSize: '0.9375rem', lineHeight: 1.5 }}
              data-testid="incident-description"
            >
              {incident.description}
            </p>
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {incident.status === 'REPORTED' && canInvestigate && (
              <button
                type="button"
                onClick={handleStartInvestigation}
                style={{
                  padding: '0.5rem 1rem',
                  background: '#f59e0b',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
                data-testid="start-investigation-btn"
              >
                Start Investigation
              </button>
            )}

            {(incident.status === 'REPORTED' || incident.status === 'INVESTIGATING') &&
              canResolve && (
                <button
                  type="button"
                  onClick={() => setShowResolveModal(true)}
                  style={{
                    padding: '0.5rem 1rem',
                    background: '#059669',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '6px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                  data-testid="resolve-incident-btn"
                >
                  Resolve Incident
                </button>
              )}

            {incident.status === 'RESOLVED' && canClose && (
              <button
                type="button"
                onClick={handleCloseIncident}
                style={{
                  padding: '0.5rem 1rem',
                  background: '#374151',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
                data-testid="close-incident-btn"
              >
                Close Incident
              </button>
            )}

            {!isTerminal && canCancel && (
              <button
                type="button"
                onClick={() => setShowCancelModal(true)}
                style={{
                  padding: '0.5rem 1rem',
                  background: '#dc2626',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
                data-testid="cancel-incident-btn"
              >
                Cancel Report
              </button>
            )}
          </div>
        </div>

        {/* Metadata Details Bar */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '1rem',
            marginTop: '1.25rem',
            paddingTop: '1.25rem',
            borderTop: '1px solid #f3f4f6',
            fontSize: '0.875rem',
          }}
        >
          <div>
            <span style={{ color: '#6b7280', display: 'block' }}>Occurred At:</span>
            <span style={{ fontWeight: 500 }} data-testid="incident-occurred-at">
              {new Date(incident.occurredAt).toLocaleString()}
            </span>
          </div>
          <div>
            <span style={{ color: '#6b7280', display: 'block' }}>Reported At:</span>
            <span style={{ fontWeight: 500 }}>
              {new Date(incident.reportedAt).toLocaleString()}
            </span>
          </div>
          <div>
            <span style={{ color: '#6b7280', display: 'block' }}>Location:</span>
            <span style={{ fontWeight: 500 }}>{incident.locationText || 'Not specified'}</span>
          </div>
          <div>
            <span style={{ color: '#6b7280', display: 'block' }}>Version:</span>
            <span style={{ fontWeight: 500 }} data-testid="incident-version">
              {incident.version}
            </span>
          </div>
        </div>

        {/* Resolution or Cancellation summary banner */}
        {incident.resolutionSummary && (
          <div
            style={{
              marginTop: '1rem',
              padding: '1rem',
              background: '#ecfdf5',
              borderRadius: '6px',
              border: '1px solid #a7f3d0',
            }}
            data-testid="resolution-banner"
          >
            <strong style={{ color: '#065f46' }}>Resolution Summary:</strong>
            <p style={{ margin: '0.25rem 0 0 0', color: '#047857' }}>
              {incident.resolutionSummary}
            </p>
            {incident.resolvedAt && (
              <span
                style={{
                  fontSize: '0.75rem',
                  color: '#059669',
                  display: 'block',
                  marginTop: '0.25rem',
                }}
              >
                Resolved on {new Date(incident.resolvedAt).toLocaleString()}
              </span>
            )}
          </div>
        )}

        {(incident.cancelReason || incident.cancellationReason) && (
          <div
            style={{
              marginTop: '1rem',
              padding: '1rem',
              background: '#fef2f2',
              borderRadius: '6px',
              border: '1px solid #fecaca',
            }}
            data-testid="cancellation-banner"
          >
            <strong style={{ color: '#991b1b' }}>Cancellation Reason:</strong>
            <p style={{ margin: '0.25rem 0 0 0', color: '#b91c1c' }}>
              {incident.cancellationReason || incident.cancelReason}
            </p>
          </div>
        )}
      </div>

      {/* Grid: Subjects & Maintenance */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '1.5rem',
          marginBottom: '1.5rem',
        }}
      >
        {/* Linked Subjects Card */}
        <div
          style={{
            background: '#fff',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            padding: '1.25rem',
          }}
        >
          <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: '0 0 1rem 0' }}>
            Associated Subjects
          </h3>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem',
              fontSize: '0.875rem',
            }}
          >
            <div>
              <span style={{ color: '#6b7280', display: 'block' }}>Vehicle:</span>
              {incident.vehicle ? (
                <Link
                  href={`/vehicles/${incident.vehicle.id}`}
                  style={{ color: '#2563eb', fontWeight: 600, textDecoration: 'none' }}
                  data-testid="linked-vehicle"
                >
                  {incident.vehicle.displayId} ({incident.vehicle.registration} -{' '}
                  {incident.vehicle.model})
                </Link>
              ) : (
                <span style={{ color: '#9ca3af' }}>No vehicle linked</span>
              )}
            </div>

            <div>
              <span style={{ color: '#6b7280', display: 'block' }}>Driver:</span>
              {incident.driver ? (
                <Link
                  href={`/drivers/${incident.driver.id}`}
                  style={{ color: '#2563eb', fontWeight: 600, textDecoration: 'none' }}
                  data-testid="linked-driver"
                >
                  {incident.driver.displayId} ({incident.driver.firstName}{' '}
                  {incident.driver.lastName})
                </Link>
              ) : (
                <span style={{ color: '#9ca3af' }}>No driver linked</span>
              )}
            </div>

            <div>
              <span style={{ color: '#6b7280', display: 'block' }}>Trip:</span>
              {incident.trip ? (
                <Link
                  href={`/trips/${incident.trip.id}`}
                  style={{ color: '#2563eb', fontWeight: 600, textDecoration: 'none' }}
                  data-testid="linked-trip"
                >
                  {incident.trip.displayId} [{incident.trip.status}]
                </Link>
              ) : (
                <span style={{ color: '#9ca3af' }}>No trip linked (Standalone report)</span>
              )}
            </div>
          </div>
        </div>

        {/* Maintenance Integration Card */}
        <div
          style={{
            background: '#fff',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            padding: '1.25rem',
          }}
          data-testid="maintenance-integration-card"
        >
          <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: '0 0 0.5rem 0' }}>
            Maintenance Integration
          </h3>
          <p style={{ fontSize: '0.8125rem', color: '#6b7280', margin: '0 0 1rem 0' }}>
            Convert breakdown or damage incidents into trackable Work Orders and Maintenance
            Requests.
          </p>

          {incident.maintenanceRequest ? (
            <div
              style={{
                padding: '0.75rem',
                background: '#f0fdf4',
                border: '1px solid #bbf7d0',
                borderRadius: '6px',
              }}
              data-testid="existing-mr-card"
            >
              <div
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <span style={{ fontWeight: 600, color: '#166534' }}>
                  {incident.maintenanceRequest.displayId}
                </span>
                <span
                  style={{
                    padding: '0.2rem 0.5rem',
                    background: '#dcfce7',
                    color: '#15803d',
                    borderRadius: '4px',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                  }}
                >
                  {incident.maintenanceRequest.status}
                </span>
              </div>
              <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.875rem', color: '#14532d' }}>
                {incident.maintenanceRequest.title}
              </p>
              <Link
                href="/maintenance"
                style={{
                  display: 'inline-block',
                  marginTop: '0.5rem',
                  fontSize: '0.8125rem',
                  color: '#15803d',
                  fontWeight: 600,
                  textDecoration: 'none',
                }}
              >
                View in Maintenance &rarr;
              </Link>
            </div>
          ) : incident.vehicle ? (
            <div>
              {canCreateMaintenance && (
                <button
                  type="button"
                  onClick={handleCreateMaintenanceRequest}
                  disabled={creatingMaintenance}
                  style={{
                    padding: '0.5rem 1rem',
                    background: '#2563eb',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '6px',
                    fontWeight: 600,
                    cursor: creatingMaintenance ? 'not-allowed' : 'pointer',
                    fontSize: '0.875rem',
                  }}
                  data-testid="create-mr-btn"
                >
                  {creatingMaintenance ? 'Creating...' : '+ Create Maintenance Request'}
                </button>
              )}
            </div>
          ) : (
            <p style={{ fontSize: '0.875rem', color: '#9ca3af' }}>
              Maintenance requests require a linked subject vehicle.
            </p>
          )}
        </div>
      </div>

      {/* Investigation Notes Section */}
      <div
        style={{
          background: '#fff',
          border: '1px solid #e5e7eb',
          borderRadius: '8px',
          padding: '1.5rem',
          marginBottom: '1.5rem',
        }}
        data-testid="notes-section"
      >
        <h3 style={{ fontSize: '1.125rem', fontWeight: 600, margin: '0 0 1rem 0' }}>
          Investigation Notes Thread ({notes.length})
        </h3>

        {/* Existing notes list */}
        {notes.length === 0 ? (
          <p style={{ color: '#6b7280', fontSize: '0.875rem', margin: '0 0 1rem 0' }}>
            No investigation notes added yet.
          </p>
        ) : (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem',
              marginBottom: '1.25rem',
            }}
          >
            {notes.map((n) => (
              <div
                key={n.id}
                style={{
                  padding: '0.75rem 1rem',
                  background: '#f9fafb',
                  border: '1px solid #e5e7eb',
                  borderRadius: '6px',
                }}
                data-testid={`note-${n.id}`}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    marginBottom: '0.25rem',
                    fontSize: '0.75rem',
                    color: '#6b7280',
                  }}
                >
                  <span style={{ fontWeight: 600, color: '#374151' }}>
                    {n.createdByUser?.displayName || n.createdByName || 'Investigator'}
                  </span>
                  <span>{new Date(n.createdAt).toLocaleString()}</span>
                </div>
                <p
                  style={{
                    margin: 0,
                    fontSize: '0.875rem',
                    color: '#1f2937',
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {n.body}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* Add Note Form */}
        {canAddNote && !isTerminal && (
          <form
            onSubmit={handleAddNote}
            style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}
          >
            <textarea
              required
              rows={2}
              placeholder="Add an immutable investigation note, interview update, or telemetry log..."
              value={newNoteBody}
              onChange={(e) => setNewNoteBody(e.target.value)}
              style={{
                flex: 1,
                padding: '0.5rem',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '0.875rem',
              }}
              data-testid="input-note-body"
            />
            <button
              type="submit"
              disabled={submittingNote || !newNoteBody.trim()}
              style={{
                padding: '0.5rem 1rem',
                background: '#4b5563',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                fontWeight: 600,
                cursor: submittingNote || !newNoteBody.trim() ? 'not-allowed' : 'pointer',
                opacity: submittingNote || !newNoteBody.trim() ? 0.6 : 1,
                fontSize: '0.875rem',
              }}
              data-testid="add-note-btn"
            >
              {submittingNote ? 'Saving...' : 'Add Note'}
            </button>
          </form>
        )}
      </div>

      {/* Evidence Attachments Section */}
      <div
        style={{
          background: '#fff',
          border: '1px solid #e5e7eb',
          borderRadius: '8px',
          padding: '1.5rem',
          marginBottom: '1.5rem',
        }}
        data-testid="attachments-section"
      >
        <h3 style={{ fontSize: '1.125rem', fontWeight: 600, margin: '0 0 1rem 0' }}>
          Evidence Attachments ({attachments.length})
        </h3>

        {/* Attachments table / list */}
        {attachments.length === 0 ? (
          <p style={{ color: '#6b7280', fontSize: '0.875rem', margin: '0 0 1rem 0' }}>
            No evidence files attached. Upload police reports, scene photos, or witness statements
            below.
          </p>
        ) : (
          <div style={{ overflowX: 'auto', marginBottom: '1.5rem' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
              <thead>
                <tr
                  style={{
                    background: '#f9fafb',
                    borderBottom: '1px solid #e5e7eb',
                    textAlign: 'left',
                  }}
                >
                  <th style={{ padding: '0.5rem 0.75rem' }}>File Name</th>
                  <th style={{ padding: '0.5rem 0.75rem' }}>Type</th>
                  <th style={{ padding: '0.5rem 0.75rem' }}>Size</th>
                  <th style={{ padding: '0.5rem 0.75rem' }}>SHA-256 Hash</th>
                  <th style={{ padding: '0.5rem 0.75rem' }}>Uploaded</th>
                  <th style={{ padding: '0.5rem 0.75rem', textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {attachments.map((att) => (
                  <tr
                    key={att.id}
                    style={{ borderBottom: '1px solid #f3f4f6' }}
                    data-testid={`attachment-row-${att.id}`}
                  >
                    <td style={{ padding: '0.5rem 0.75rem', fontWeight: 500 }}>{att.fileName}</td>
                    <td style={{ padding: '0.5rem 0.75rem' }}>
                      <span
                        style={{
                          padding: '0.2rem 0.4rem',
                          background: '#e0e7ff',
                          color: '#3730a3',
                          borderRadius: '4px',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                        }}
                      >
                        {att.attachmentType}
                      </span>
                    </td>
                    <td style={{ padding: '0.5rem 0.75rem', color: '#6b7280' }}>
                      {Math.round((att.fileSizeBytes || att.sizeBytes) / 1024)} KB
                    </td>
                    <td
                      style={{
                        padding: '0.5rem 0.75rem',
                        fontFamily: 'monospace',
                        fontSize: '0.75rem',
                        color: '#6b7280',
                      }}
                    >
                      {(att.fileHashSha256 || att.sha256).slice(0, 16)}...
                    </td>
                    <td style={{ padding: '0.5rem 0.75rem', color: '#6b7280' }}>
                      {new Date(att.createdAt).toLocaleDateString()}
                    </td>
                    <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right' }}>
                      {canDownload && (
                        <button
                          type="button"
                          onClick={() => handleDownloadAttachment(att.id, att.fileName)}
                          style={{
                            padding: '0.25rem 0.5rem',
                            background: '#2563eb',
                            color: '#fff',
                            border: 'none',
                            borderRadius: '4px',
                            fontSize: '0.75rem',
                            fontWeight: 500,
                            cursor: 'pointer',
                          }}
                          data-testid={`download-attachment-btn-${att.id}`}
                        >
                          Download
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Upload Form */}
        {canUpload && !isTerminal && (
          <form
            onSubmit={handleUploadAttachment}
            style={{
              padding: '1rem',
              background: '#f9fafb',
              border: '1px solid #e5e7eb',
              borderRadius: '6px',
            }}
          >
            <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '0.875rem', fontWeight: 600 }}>
              Upload New Evidence (PDF, PNG, JPEG)
            </h4>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: '0.75rem',
                marginBottom: '0.75rem',
              }}
            >
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.75rem',
                    fontWeight: 500,
                    marginBottom: '0.25rem',
                  }}
                >
                  File *
                </label>
                <input
                  type="file"
                  required
                  accept="application/pdf,image/png,image/jpeg"
                  onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                  style={{ fontSize: '0.8125rem' }}
                  data-testid="input-attachment-file"
                />
              </div>

              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.75rem',
                    fontWeight: 500,
                    marginBottom: '0.25rem',
                  }}
                >
                  Attachment Type
                </label>
                <select
                  value={attachmentType}
                  onChange={(e) => setAttachmentType(e.target.value as IncidentAttachmentType)}
                  style={{
                    width: '100%',
                    padding: '0.4rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px',
                    fontSize: '0.8125rem',
                  }}
                  data-testid="input-attachment-type"
                >
                  <option value="DOCUMENT">Document (PDF report, citation)</option>
                  <option value="PHOTO">Photo (Damage, scene, vehicle)</option>
                  <option value="OTHER">Other Evidence</option>
                </select>
              </div>

              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.75rem',
                    fontWeight: 500,
                    marginBottom: '0.25rem',
                  }}
                >
                  Description / Caption (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Police Collision Report"
                  value={attachmentDescription}
                  onChange={(e) => setAttachmentDescription(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.4rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px',
                    fontSize: '0.8125rem',
                  }}
                  data-testid="input-attachment-caption"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={uploadingAttachment || !selectedFile}
              style={{
                padding: '0.4rem 1rem',
                background: '#1d4ed8',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                fontWeight: 600,
                fontSize: '0.8125rem',
                cursor: uploadingAttachment || !selectedFile ? 'not-allowed' : 'pointer',
                opacity: uploadingAttachment || !selectedFile ? 0.6 : 1,
              }}
              data-testid="upload-attachment-btn"
            >
              {uploadingAttachment ? 'Uploading...' : 'Upload Attachment'}
            </button>
          </form>
        )}
      </div>

      {/* Status History Timeline */}
      {incident.statusHistory && incident.statusHistory.length > 0 && (
        <div
          style={{
            background: '#fff',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            padding: '1.5rem',
          }}
          data-testid="status-history-section"
        >
          <h3 style={{ fontSize: '1.125rem', fontWeight: 600, margin: '0 0 1rem 0' }}>
            Status Lifecycle Audit
          </h3>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem',
              fontSize: '0.875rem',
            }}
          >
            {incident.statusHistory.map((h) => (
              <div
                key={h.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '0.5rem 0.75rem',
                  background: '#f9fafb',
                  borderRadius: '4px',
                }}
              >
                <div>
                  <span style={{ fontWeight: 600 }}>
                    {h.fromStatus ? `${h.fromStatus} \u2192 ` : ''}
                    {h.toStatus}
                  </span>
                  {h.reason && (
                    <span style={{ color: '#4b5563', marginLeft: '0.5rem' }}>— {h.reason}</span>
                  )}
                </div>
                <div style={{ color: '#6b7280', fontSize: '0.75rem' }}>
                  <span>{h.actorName || 'System'}</span> &bull;{' '}
                  <span>{new Date(h.createdAt).toLocaleString()}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Resolve Modal Dialog */}
      {showResolveModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50,
          }}
          data-testid="resolve-modal"
        >
          <div
            style={{
              background: '#fff',
              borderRadius: '8px',
              padding: '1.5rem',
              width: '100%',
              maxWidth: '500px',
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)',
            }}
          >
            <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.25rem', fontWeight: 600 }}>
              Resolve Incident
            </h3>
            <p style={{ margin: '0 0 1rem 0', fontSize: '0.875rem', color: '#4b5563' }}>
              Resolving unblocks the vehicle/driver from operational dispatch gates. Please record
              your investigation findings and corrective actions.
            </p>
            <form onSubmit={handleResolveSubmit}>
              <div style={{ marginBottom: '1rem' }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    marginBottom: '0.25rem',
                  }}
                >
                  Resolution Summary *
                </label>
                <textarea
                  required
                  rows={4}
                  placeholder="e.g. Police report filed, vehicle inspection passed, driver cleared for duty."
                  value={resolutionSummary}
                  onChange={(e) => setResolutionSummary(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                  }}
                  data-testid="input-resolution-summary"
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setShowResolveModal(false)}
                  style={{
                    padding: '0.5rem 1rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    background: '#fff',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={modalLoading}
                  style={{
                    padding: '0.5rem 1rem',
                    background: '#059669',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '6px',
                    fontWeight: 600,
                  }}
                  data-testid="confirm-resolve-btn"
                >
                  {modalLoading ? 'Resolving...' : 'Confirm Resolution'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Cancel Modal Dialog */}
      {showCancelModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50,
          }}
          data-testid="cancel-modal"
        >
          <div
            style={{
              background: '#fff',
              borderRadius: '8px',
              padding: '1.5rem',
              width: '100%',
              maxWidth: '500px',
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)',
            }}
          >
            <h3
              style={{
                margin: '0 0 0.5rem 0',
                fontSize: '1.25rem',
                fontWeight: 600,
                color: '#dc2626',
              }}
            >
              Cancel Incident Report
            </h3>
            <p style={{ margin: '0 0 1rem 0', fontSize: '0.875rem', color: '#4b5563' }}>
              Cancelling is an immutable terminal transition. Enter the reason for cancelling this
              incident report (e.g., entered in duplicate, logged against wrong vehicle).
            </p>
            <form onSubmit={handleCancelSubmit}>
              <div style={{ marginBottom: '1rem' }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    marginBottom: '0.25rem',
                  }}
                >
                  Cancellation Reason *
                </label>
                <textarea
                  required
                  rows={3}
                  placeholder="e.g. Duplicate report entered by mistake."
                  value={cancellationReason}
                  onChange={(e) => setCancellationReason(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                  }}
                  data-testid="input-cancel-reason"
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setShowCancelModal(false)}
                  style={{
                    padding: '0.5rem 1rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    background: '#fff',
                  }}
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={modalLoading}
                  style={{
                    padding: '0.5rem 1rem',
                    background: '#dc2626',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '6px',
                    fontWeight: 600,
                  }}
                  data-testid="confirm-cancel-btn"
                >
                  {modalLoading ? 'Cancelling...' : 'Confirm Cancellation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
