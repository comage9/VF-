interface InventoryActionBarProps {
  onBulkEdit?: () => void;
  onUploadCsv?: () => void;
  onExport?: () => void;
  onDownloadTemplate?: () => void;
  onResetView?: () => void;
}

function defaultFallback(handlerName: string) {
  return () => {
    console.warn(`Action "${handlerName}" is not wired yet.`);
    alert('해당 기능은 아직 준비 중입니다.');
  };
}

export function InventoryActionBar({
  onBulkEdit,
  onUploadCsv,
  onExport,
  onDownloadTemplate,
  onResetView,
}: InventoryActionBarProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card/80 p-4 shadow-sm">
      <div className="text-sm text-muted-foreground">
        빠른 액션을 통해 CSV 업로드, 일괄 수정, 템플릿 다운로드를 실행할 수 있습니다.
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onBulkEdit || defaultFallback('bulkEdit')}
          className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted/60"
        >
          <i className="fas fa-layer-group mr-2" aria-hidden /> 일괄 편집
        </button>
        <button
          type="button"
          onClick={onUploadCsv || defaultFallback('uploadCsv')}
          className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted/60"
        >
          <i className="fas fa-file-upload mr-2" aria-hidden /> CSV 업로드
        </button>
        <button
          type="button"
          onClick={onExport || defaultFallback('export')}
          className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted/60"
        >
          <i className="fas fa-file-export mr-2" aria-hidden /> 내보내기
        </button>
        <button
          type="button"
          onClick={onDownloadTemplate || defaultFallback('downloadTemplate')}
          className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted/60"
        >
          <i className="fas fa-cloud-download mr-2" aria-hidden /> 템플릿 다운로드
        </button>
        <button
          type="button"
          onClick={onResetView || defaultFallback('resetView')}
          className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground hover:bg-primary/90"
        >
          전체 보기
        </button>
      </div>
    </div>
  );
}
