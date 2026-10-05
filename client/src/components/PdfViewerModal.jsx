import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Download, ExternalLink, FileText, AlertCircle } from 'lucide-react';
import { dataURItoBlob, downloadPdfFile, openPdfInNewTab, getAuthenticatedMediaUrl } from '../utils/helpers';

export default function PdfViewerModal({ isOpen, onClose, pdfData }) {
  const [blobUrl, setBlobUrl] = useState(null);

  useEffect(() => {
    if (!isOpen || !pdfData?.mediaUrl) {
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
        setBlobUrl(null);
      }
      return;
    }

    const isPdfDataUri = typeof pdfData.mediaUrl === 'string' && pdfData.mediaUrl.startsWith('data:application/pdf');
    const isBlobUrl = typeof pdfData.mediaUrl === 'string' && pdfData.mediaUrl.startsWith('blob:');
    const isFileUrl = typeof pdfData.mediaUrl === 'string' && (pdfData.mediaUrl.startsWith('/api/files/') || pdfData.mediaUrl.startsWith('http'));

    if (!isPdfDataUri && !isBlobUrl && !isFileUrl) {
      setBlobUrl(null);
      return;
    }

    if (isFileUrl) {
      let isCancelled = false;
      let createdBlobUrl = null;
      const targetUrl = getAuthenticatedMediaUrl(pdfData.mediaUrl);
      fetch(targetUrl)
        .then(res => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.blob();
        })
        .then(blob => {
          if (!isCancelled) {
            createdBlobUrl = URL.createObjectURL(blob);
            setBlobUrl(createdBlobUrl);
          }
        })
        .catch(err => {
          console.error('Failed to load PDF preview:', err);
          if (!isCancelled) setBlobUrl(null);
        });

      return () => {
        isCancelled = true;
        if (createdBlobUrl) {
          URL.revokeObjectURL(createdBlobUrl);
        }
      };
    }

    const blob = dataURItoBlob(pdfData.mediaUrl);
    if (blob) {
      const url = URL.createObjectURL(blob);
      setBlobUrl(url);
      return () => {
        URL.revokeObjectURL(url);
      };
    } else {
      setBlobUrl(isBlobUrl ? pdfData.mediaUrl : null);
    }
  }, [isOpen, pdfData?.mediaUrl]);

  if (!isOpen || !pdfData) return null;

  const fileName = pdfData.fileName || 'Document.pdf';
  const fileSize = pdfData.fileSize || 'PDF File';

  const handleDownload = () => {
    downloadPdfFile(pdfData.mediaUrl, fileName);
  };

  const handleOpenNewWindow = () => {
    if (blobUrl) {
      window.open(blobUrl, '_blank', 'noopener,noreferrer');
    } else {
      openPdfInNewTab(pdfData.mediaUrl, fileName);
    }
  };

  const modalContent = (
    <div className="modal-overlay" style={{ zIndex: 9999, padding: '16px' }}>
      <div 
        className="modal-dialog" 
        style={{ 
          maxWidth: '1080px', 
          width: '95vw', 
          height: '90vh', 
          maxHeight: '92vh',
          display: 'flex', 
          flexDirection: 'column', 
          padding: '18px',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.7)',
          border: '1px solid rgba(255, 255, 255, 0.15)'
        }}
      >
        {/* Header */}
        <div className="pdf-modal-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexShrink: 0, gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
            <div style={{
              width: 38,
              height: 38,
              borderRadius: '10px',
              background: 'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 12px rgba(239, 68, 68, 0.4)',
              flexShrink: 0
            }}>
              <FileText size={20} color="#fff" />
            </div>
            <div style={{ minWidth: 0 }}>
              <h3 style={{ fontSize: '0.98rem', fontWeight: 700, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {fileName}
              </h3>
              <span style={{ fontSize: '0.72rem', color: '#fda4af' }}>{fileSize} • Preview</span>
            </div>
          </div>

          <div className="pdf-modal-actions" style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <button
              type="button"
              className="pdf-action-link"
              onClick={handleOpenNewWindow}
              title="Open in new window"
              style={{ padding: '6px 10px' }}
            >
              <ExternalLink size={14} />
              <span className="pdf-action-label">Open</span>
            </button>

            <button
              type="button"
              className="pdf-action-link primary"
              onClick={handleDownload}
              title="Download PDF"
              style={{ padding: '6px 10px' }}
            >
              <Download size={14} />
              <span className="pdf-action-label">Save</span>
            </button>

            <button
              type="button"
              className="modal-close-btn"
              onClick={onClose}
              title="Close viewer"
              style={{ marginLeft: 2 }}
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Embedded PDF Viewer (fills 100% full height and width) */}
        <div style={{
          flex: 1,
          width: '100%',
          position: 'relative',
          background: '#0f172a',
          borderRadius: '10px',
          overflow: 'hidden',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          minHeight: 0
        }}>
          {blobUrl ? (
            <iframe
              src={blobUrl}
              title={fileName}
              sandbox="allow-scripts allow-downloads"
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                border: 'none',
                background: '#ffffff',
                borderRadius: '8px'
              }}
            />
          ) : (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              gap: 12,
              color: 'var(--text-muted)'
            }}>
              <AlertCircle size={32} color="#f59e0b" />
              <p>Preparing PDF document...</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
}
