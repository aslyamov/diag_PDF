import * as pdfjsLib from 'pdfjs-dist';

// Set up worker
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url
).toString();

let cachedPdf = null;

let currentRenderTask = null;

export async function renderPdfPreview(pdfBlob, pageNum, canvasEl) {
  if (!canvasEl || !pdfBlob) return;

  if (currentRenderTask) {
    try {
      currentRenderTask.cancel();
    } catch (e) {
      // Ignore cancellation exception
    }
  }

  const arrayBuffer = await pdfBlob.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });

  if (cachedPdf) {
    try { cachedPdf.destroy(); } catch (e) { /* ignore */ }
  }

  cachedPdf = await loadingTask.promise;

  const totalPages = cachedPdf.numPages;
  const targetPage = Math.min(Math.max(1, pageNum + 1), totalPages);

  const page = await cachedPdf.getPage(targetPage);
  const viewport = page.getViewport({ scale: 1.2 });

  const canvas = canvasEl;
  const context = canvas.getContext('2d');
  canvas.height = viewport.height;
  canvas.width = viewport.width;

  const renderContext = {
    canvasContext: context,
    viewport: viewport
  };

  currentRenderTask = page.render(renderContext);

  try {
    await currentRenderTask.promise;
    return { totalPages };
  } catch (e) {
    if (e?.name !== 'RenderingCancelledException') {
      console.error(e);
    }
    return null;
  }
}
