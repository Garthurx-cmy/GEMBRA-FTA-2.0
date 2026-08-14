/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from "react";
import { dbService } from "../services/db";
import { Inspection, Supervisor, Area, Contract, SystemConfig, getTipoLancamento } from "../types";
import { Printer, FileText, Calendar, User, ShieldAlert, CheckCircle, Eye, RefreshCw, Download, Filter, XCircle } from "lucide-react";
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import ResolvedImage from "./ResolvedImage";

import assinaturaJhonata from "../assets/assinatura-jhonata.png?inline";

interface RelatoriosViewProps {
  inspections: Inspection[];
  supervisors: Supervisor[];
  areas: Area[];
  contracts: Contract[];
  config: SystemConfig;
  initialSelectedInspectionId?: string | null;
}

// Beautiful automatic photo layout organizer (No cropping, auto fit, page break safe)
function PhotoGrid({ title, photos, isBefore, rotations }: { title: string; photos: string[]; isBefore: boolean; rotations?: number[] }) {
  const count = photos.length;

  if (count === 0) {
    return (
      <div className="space-y-2 flex-1 break-inside-avoid page-break-inside-avoid photo-grid-block">
        <span className={`block text-[10px] font-bold uppercase tracking-widest text-center border-b pb-1 photo-grid-title ${
          isBefore ? "text-red-600 border-red-50" : "text-green-700 border-green-50"
        }`}>
          {title}
        </span>
        <div className="flex items-center justify-center border border-dashed border-gray-200 rounded-lg bg-gray-50/50 p-6 min-h-[140px]">
          <span className="text-[10px] text-gray-400 font-bold tracking-wide uppercase italic text-center">
            Sem registro fotográfico para este estágio.
          </span>
        </div>
      </div>
    );
  }

  // Multi-photo grids fit elegantly on standard A4 page layout
  let gridClass = "grid grid-cols-1 gap-2.5";
  if (count === 2) {
    gridClass = "grid grid-cols-2 gap-2.5";
  } else if (count >= 3) {
    gridClass = "grid grid-cols-2 gap-2.5";
  }

  return (
    <div className="space-y-2 flex-1 break-inside-avoid page-break-inside-avoid photo-grid-block">
      <span className={`block text-[10px] font-bold uppercase tracking-widest text-center border-b pb-1 photo-grid-title ${
        isBefore ? "text-red-600 border-red-50" : "text-green-700 border-green-50"
      }`}>
        {title} ({count})
      </span>
      <div className={gridClass}>
        {photos.map((img, idx) => {
          return (
            <div key={idx} className="relative aspect-video rounded-lg border border-gray-200 bg-slate-50 flex items-center justify-center overflow-hidden shadow-2xs hover:shadow-xs transition-shadow photo-card-container">
              {/* object-contain ensures images are never cropped, showing full structural details */}
              <ResolvedImage
                src={img}
                rotation={rotations ? rotations[idx] || 0 : 0}
                alt={`${title} ${idx + 1}`}
                className="w-full h-full object-contain max-h-[180px] select-none photo-img"
                referrerPolicy="no-referrer"
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function RelatoriosView({
  inspections,
  supervisors,
  areas,
  contracts,
  config,
  initialSelectedInspectionId
}: RelatoriosViewProps) {
  const [selectedId, setSelectedId] = useState<string>("");

  // Filters state
  const [selectedSupervisor, setSelectedSupervisor] = useState<string>("");
  const [selectedArea, setSelectedArea] = useState<string>("");
  const [selectedTipo, setSelectedTipo] = useState<string>("");
  const [selectedStatus, setSelectedStatus] = useState<string>("");
  const [selectedPotencial, setSelectedPotencial] = useState<string>("");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [selectedMonth, setSelectedMonth] = useState<string>("");
  const [selectedYear, setSelectedYear] = useState<string>("");

  // --- ON-DEMAND BACKGROUND FILTERING STATES ---
  const [fetchedInspections, setFetchedInspections] = useState<Inspection[]>([]);
  const [loadingFilters, setLoadingFilters] = useState(false);

  const filtersActive = !!(
    selectedSupervisor ||
    selectedArea ||
    selectedTipo ||
    selectedStatus ||
    selectedPotencial ||
    startDate ||
    endDate ||
    selectedMonth ||
    selectedYear
  );

  useEffect(() => {
    if (!filtersActive) {
      setFetchedInspections([]);
      return;
    }

    let active = true;
    const fetchFiltered = async () => {
      if (document.visibilityState !== "visible") return;
      setLoadingFilters(true);
      try {
        const result = await dbService.getPaginatedInspections({
          limit: 100, // Fetch up to 100 matched records for reports
          filters: {
            supervisorId: selectedSupervisor,
            areaId: selectedArea,
            tipo: selectedTipo,
            status: selectedStatus,
            potencial: selectedPotencial,
            data: startDate || undefined
          }
        });
        if (active) {
          setFetchedInspections(result.items);
        }
      } catch (err) {
        console.error("Erro ao carregar relatórios filtrados:", err);
      } finally {
        if (active) setLoadingFilters(false);
      }
    };

    const timer = setTimeout(fetchFiltered, 350);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [
    selectedSupervisor,
    selectedArea,
    selectedTipo,
    selectedStatus,
    selectedPotencial,
    startDate,
    endDate,
    selectedMonth,
    selectedYear,
    filtersActive
  ]);

  const combinedInspections = useMemo(() => {
    if (!filtersActive) return inspections;
    const seen = new Set<string>();
    const merged: Inspection[] = [];
    [...fetchedInspections, ...inspections].forEach(item => {
      if (!seen.has(item.id)) {
        seen.add(item.id);
        merged.push(item);
      }
    });
    return merged;
  }, [inspections, fetchedInspections, filtersActive]);

  // Calculate unique types of launch dynamically
  const uniqueTipos = useMemo(() => {
    const set = new Set<string>();
    combinedInspections.forEach((i) => {
      if (i.tipo) set.add(i.tipo);
      const resolved = getTipoLancamento(i.atividade, i.tipo);
      if (resolved) set.add(resolved);
    });
    return Array.from(set);
  }, [combinedInspections]);

  // Calculate unique years dynamically
  const uniqueYears = useMemo(() => {
    const years = new Set<string>();
    combinedInspections.forEach((i) => {
      if (i.data) {
        const yr = i.data.split("-")[0];
        if (yr && yr.length === 4) {
          years.add(yr);
        }
      }
    });
    years.add(new Date().getFullYear().toString());
    return Array.from(years).sort().reverse();
  }, [combinedInspections]);

  // Apply filters memoized
  const filteredInspections = useMemo(() => {
    return combinedInspections.filter((item) => {
      if (selectedSupervisor && item.supervisorId !== selectedSupervisor) {
        return false;
      }
      if (selectedArea && item.areaId !== selectedArea) {
        return false;
      }
      if (selectedTipo) {
        const itemTipoLancamento = getTipoLancamento(item.atividade, item.tipo);
        if (item.tipo !== selectedTipo && itemTipoLancamento !== selectedTipo) {
          return false;
        }
      }
      if (selectedStatus && item.status !== selectedStatus) {
        return false;
      }
      if (selectedPotencial && item.potencial !== selectedPotencial) {
        return false;
      }
      if (startDate && item.data < startDate) {
        return false;
      }
      if (endDate && item.data > endDate) {
        return false;
      }
      if (selectedMonth || selectedYear) {
        const [year, month] = item.data.split("-");
        if (selectedYear && year !== selectedYear) {
          return false;
        }
        if (selectedMonth && month !== selectedMonth) {
          return false;
        }
      }
      return true;
    });
  }, [
    combinedInspections,
    selectedSupervisor,
    selectedArea,
    selectedTipo,
    selectedStatus,
    selectedPotencial,
    startDate,
    endDate,
    selectedMonth,
    selectedYear
  ]);

  // Select first inspection by default or initial if provided, or handle empty filters auto selection
  useEffect(() => {
    if (initialSelectedInspectionId && inspections.some(i => i.id === initialSelectedInspectionId)) {
      setSelectedId(initialSelectedInspectionId);
    } else if (filteredInspections.length > 0) {
      const isStillInList = filteredInspections.some((i) => i.id === selectedId);
      if (!isStillInList) {
        setSelectedId(filteredInspections[0].id);
      }
    } else {
      setSelectedId("");
    }
  }, [filteredInspections, initialSelectedInspectionId, inspections, selectedId]);

  const handleClearFilters = () => {
    setSelectedSupervisor("");
    setSelectedArea("");
    setSelectedTipo("");
    setSelectedStatus("");
    setSelectedPotencial("");
    setStartDate("");
    setEndDate("");
    setSelectedMonth("");
    setSelectedYear("");
  };

  const selectedInspection = inspections.find((i) => i.id === selectedId);
  const isDSS = selectedInspection && getTipoLancamento(selectedInspection.atividade, selectedInspection.tipo) === "DSS";
  const isPresenca = selectedInspection && getTipoLancamento(selectedInspection.atividade, selectedInspection.tipo) === "Presença em Campo";

  // Helper resolvers
  const getSupervisorName = (id: string) => supervisors.find((s) => s.id === id)?.nome || dbService.getDeletedNames()[id] || "Outros";
  const getAreaName = (id: string) => areas.find((a) => a.id === id)?.nome || dbService.getDeletedNames()[id] || "Outros";
  const getContractCode = (id: string) => contracts.find((c) => c.id === id)?.codigo || dbService.getDeletedNames()[id] || "Geral";

  // Dynamic computation of report generation timestamp
  const reportGenerationTime = useMemo(() => {
    const now = new Date();
    return now.toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });
  }, [selectedId]);

  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [isPreparingPrint, setIsPreparingPrint] = useState(false);

  const getFallbackColor = (contents: string): string => {
    const lower = contents.toLowerCase();
    if (lower.includes("blue")) {
      return "rgb(11, 46, 89)"; // corporate blue #0B2E59
    }
    if (lower.includes("orange") || lower.includes("amber") || lower.includes("brand")) {
      return "rgb(245, 130, 32)"; // corporate orange #F58220
    }
    if (lower.includes("red") || lower.includes("danger") || lower.includes("critical")) {
      return "rgb(220, 38, 38)"; // red-600
    }
    if (lower.includes("green") || lower.includes("emerald") || lower.includes("success")) {
      return "rgb(22, 163, 74)"; // green-600
    }
    if (lower.includes("gray") || lower.includes("slate") || lower.includes("zinc") || lower.includes("neutral")) {
      return "rgb(100, 116, 139)"; // slate-500
    }
    if (lower.includes("white")) {
      return "rgb(255, 255, 255)";
    }
    if (lower.includes("black")) {
      return "rgb(0, 0, 0)";
    }
    return "rgb(100, 116, 139)";
  };

  // Helper functions to parse and convert oklch and oklab colors for html2canvas compatibility (Tailwind v4)
  const oklabToRgb = (l: number, a: number, b: number, alpha?: number): string => {
    const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
    const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
    const s_ = l - 0.0894841775 * a - 1.2914855480 * b;

    const l_lin = Math.pow(Math.max(0, l_), 3);
    const m_lin = Math.pow(Math.max(0, m_), 3);
    const s_lin = Math.pow(Math.max(0, s_), 3);

    const r_lin = +4.0767416621 * l_lin - 3.3077115913 * m_lin + 0.2309699292 * s_lin;
    const g_lin = -1.2684380046 * l_lin + 2.6097574011 * m_lin - 0.3413193965 * s_lin;
    const b_lin = -0.0041960863 * l_lin - 0.7034186147 * m_lin + 1.7076147010 * s_lin;

    const gamma = (x: number) => {
      return x <= 0.0031308 ? 12.92 * Math.max(0, x) : 1.055 * Math.pow(Math.max(0, x), 1 / 2.4) - 0.05;
    };

    const rColor = Math.max(0, Math.min(255, Math.round(gamma(r_lin) * 255)));
    const gColor = Math.max(0, Math.min(255, Math.round(gamma(g_lin) * 255)));
    const bColor = Math.max(0, Math.min(255, Math.round(gamma(b_lin) * 255)));

    if (alpha !== undefined) {
      return `rgba(${rColor}, ${gColor}, ${bColor}, ${alpha})`;
    }
    return `rgb(${rColor}, ${gColor}, ${bColor})`;
  };

  const oklchToRgb = (l: number, c: number, h: number, alpha?: number): string => {
    const hRad = (h * Math.PI) / 180;
    const a = c * Math.cos(hRad);
    const b = c * Math.sin(hRad);
    return oklabToRgb(l, a, b, alpha);
  };

  const replaceOklch = (str: string): string => {
    return str.replace(/oklch\(([^)]+)\)/g, (match, contents) => {
      try {
        const parts = contents
          .split(/[\s,/]+/)
          .map((p) => p.trim())
          .filter(Boolean);

        if (parts.length < 3 || contents.includes("var(")) {
          return getFallbackColor(contents);
        }

        const lVal = parts[0];
        const l = lVal.endsWith("%") ? parseFloat(lVal) / 100 : parseFloat(lVal);

        const cVal = parts[1];
        const c = cVal.endsWith("%") ? parseFloat(cVal) / 100 : parseFloat(cVal);

        const hVal = parts[2];
        const h = parseFloat(hVal);

        let alpha: number | undefined = undefined;
        if (parts.length >= 4) {
          const aVal = parts[3];
          if (aVal.includes("var(")) {
            alpha = 1;
          } else {
            alpha = aVal.endsWith("%") ? parseFloat(aVal) / 100 : parseFloat(aVal);
          }
        }

        if (isNaN(l) || isNaN(c) || isNaN(h)) {
          return getFallbackColor(contents);
        }

        const parsedAlpha = alpha !== undefined && !isNaN(alpha) ? alpha : undefined;
        return oklchToRgb(l, c, h, parsedAlpha);
      } catch (e) {
        return getFallbackColor(contents);
      }
    });
  };

  const replaceOklab = (str: string): string => {
    return str.replace(/oklab\(([^)]+)\)/g, (match, contents) => {
      try {
        const parts = contents
          .split(/[\s,/]+/)
          .map((p) => p.trim())
          .filter(Boolean);

        if (parts.length < 3 || contents.includes("var(")) {
          return getFallbackColor(contents);
        }

        const lVal = parts[0];
        const l = lVal.endsWith("%") ? parseFloat(lVal) / 100 : parseFloat(lVal);

        const aVal = parts[1];
        const aValNum = aVal.endsWith("%") ? parseFloat(aVal) / 100 : parseFloat(aVal);

        const bVal = parts[2];
        const bValNum = bVal.endsWith("%") ? parseFloat(bVal) / 100 : parseFloat(bVal);

        let alpha: number | undefined = undefined;
        if (parts.length >= 4) {
          const alphaVal = parts[3];
          if (alphaVal.includes("var(")) {
            alpha = 1;
          } else {
            alpha = alphaVal.endsWith("%") ? parseFloat(alphaVal) / 100 : parseFloat(alphaVal);
          }
        }

        if (isNaN(l) || isNaN(aValNum) || isNaN(bValNum)) {
          return getFallbackColor(contents);
        }

        const parsedAlpha = alpha !== undefined && !isNaN(alpha) ? alpha : undefined;
        return oklabToRgb(l, aValNum, bValNum, parsedAlpha);
      } catch (e) {
        return getFallbackColor(contents);
      }
    });
  };

  const replaceColors = (str: string): string => {
    return replaceOklab(replaceOklch(str));
  };

  const waitForImages = async (element: HTMLElement) => {
    const hasPendingConversions = () => {
      return element.innerHTML.includes("Carregando foto...");
    };

    if (hasPendingConversions()) {
      let attempts = 0;
      const maxAttempts = 40; // up to 20 seconds
      while (hasPendingConversions() && attempts < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        attempts++;
      }
    }

    if (document.fonts && document.fonts.ready) {
      await document.fonts.ready;
    }

    const imgs = Array.from(element.getElementsByTagName("img"));
    const imgPromises = imgs.map((img) => {
      if (img.complete) {
        if (typeof img.decode === "function") {
          return img.decode().catch(() => {});
        }
        return Promise.resolve();
      }
      return new Promise<void>((resolve) => {
        img.onload = () => {
          if (typeof img.decode === "function") {
            img.decode().then(resolve).catch(resolve);
          } else {
            resolve();
          }
        };
        img.onerror = () => resolve();
      });
    });
    await Promise.all(imgPromises);
  };

  const handleDownloadPDF = async () => {
    if (!selectedInspection) {
      alert("Selecione uma inspeção para gerar o relatório.");
      return;
    }

    setIsGeneratingPDF(true);
    try {
      const element = document.getElementById("printable-report-document");
      if (!element) {
        alert("Erro ao localizar o elemento do relatório.");
        setIsGeneratingPDF(false);
        return;
      }

      await waitForImages(element);

      // Render canvas using html2canvas with specific layout bounds and style cleaning onclone
      const canvas = await html2canvas(element, {
        scale: 2, // higher resolution
        useCORS: true,
        allowTaint: true,
        backgroundColor: "#ffffff",
        scrollX: 0,
        scrollY: 0,
        windowWidth: element.clientWidth,
        windowHeight: element.clientHeight,
        onclone: (clonedDoc) => {
          // 0. Monkeypatch getComputedStyle of the cloned window to convert oklch/oklab to rgb
          const clonedWin = clonedDoc.defaultView;
          if (clonedWin) {
            const originalGetComputedStyle = clonedWin.getComputedStyle;
            clonedWin.getComputedStyle = function (el: Element, pseudoElt?: string | null) {
              const style = originalGetComputedStyle.call(clonedWin, el, pseudoElt);
              return new Proxy(style, {
                get(target: any, prop: any) {
                  if (prop === "getPropertyValue") {
                    return (propertyName: string) => {
                      const val = target.getPropertyValue(propertyName);
                      if (typeof val === "string" && (val.includes("oklch") || val.includes("oklab"))) {
                        return replaceColors(val);
                      }
                      return val;
                    };
                  }
                  const val = target[prop];
                  if (typeof val === "string" && (val.includes("oklch") || val.includes("oklab"))) {
                    return replaceColors(val);
                  }
                  if (typeof val === "function") {
                    return val.bind(target);
                  }
                  return val;
                }
              }) as any;
            };
          }

          // Add pdf-mode class to the root printable element inside the clone to trigger compact print styling
          const clonedElement = clonedDoc.getElementById("printable-report-document");
          if (clonedElement) {
            clonedElement.classList.add("pdf-mode");
          }

          // 1. Process style attribute of all elements
          const allElements = clonedDoc.querySelectorAll("*");
          allElements.forEach((el) => {
            if (el instanceof HTMLElement) {
              const styleAttr = el.getAttribute("style");
              if (styleAttr && (styleAttr.includes("oklch") || styleAttr.includes("oklab"))) {
                el.setAttribute("style", replaceColors(styleAttr));
              }
            }
          });

          // 2. Remove all existing <style> and <link rel="stylesheet"> elements from the cloned document to prevent html2canvas from parsing them or fetching them
          const clonedStyles = clonedDoc.querySelectorAll("style, link[rel='stylesheet']");
          clonedStyles.forEach((el) => {
            if (el.parentNode) {
              el.parentNode.removeChild(el);
            }
          });

          // 3. Extract, clean, and inject all styles from the ORIGINAL document
          try {
            const originalSheets = Array.from(document.styleSheets);
            originalSheets.forEach((sheet) => {
              try {
                const rules = Array.from(sheet.cssRules || sheet.rules || []);
                const cssText = rules.map(rule => rule.cssText).join("\n");
                const cleanCss = replaceColors(cssText);
                
                const styleTag = clonedDoc.createElement("style");
                styleTag.textContent = cleanCss;
                clonedDoc.head.appendChild(styleTag);
              } catch (e) {
                // Ignore errors reading cross-origin rules if any
              }
            });
          } catch (e) {
            console.error("Error copying original stylesheets:", e);
          }
        }
      });

      const imgData = canvas.toDataURL("image/jpeg", 0.95);
      
      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4"
      });

      const imgWidth = 210; // A4 size width in mm
      const pageHeight = 297; // A4 size height in mm
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let heightLeft = imgHeight;
      let position = 0;

      // Add image to PDF
      pdf.addImage(imgData, "JPEG", 0, position, imgWidth, imgHeight, undefined, 'FAST');
      heightLeft -= pageHeight;

      // Add extra pages if report height exceeds one page
      while (heightLeft >= 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, "JPEG", 0, position, imgWidth, imgHeight, undefined, 'FAST');
        heightLeft -= pageHeight;
      }

      // Download PDF using the exact name requested
      pdf.save(`Relatorio_GEMBA_INSP_${selectedInspection.id.toUpperCase()}.pdf`);

      // Trigger notification for PDF generation
      const supervisorName = supervisors.find(s => s.id === selectedInspection.supervisorId)?.nome || "Supervisor";
      const launchType = getTipoLancamento(selectedInspection.atividade, selectedInspection.tipo);
      dbService.addNotification(supervisorName, "gerou um Relatório PDF", launchType);
    } catch (err) {
      console.error("Erro ao gerar PDF:", err);
      alert("Não foi possível gerar o PDF. Tente usar a função Imprimir do navegador.");
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  const handlePrint = async () => {
    if (!selectedInspection) {
      alert("Selecione uma inspeção para gerar o relatório.");
      return;
    }
    const element = document.getElementById("printable-report-document");
    if (!element) {
      alert("A área do relatório não foi encontrada.");
      return;
    }

    try {
      setIsPreparingPrint(true);
      await waitForImages(element);

      const printWindow = window.open("", "_blank", "width=1000,height=800");
      if (!printWindow) {
        alert("Permita pop-ups para abrir a impressão do relatório.");
        return;
      }

      // Collect stylesheets with absolute hrefs and style tags
      const stylesList: string[] = [];
      stylesList.push(`<base href="${window.location.origin}/">`);

      Array.from(document.querySelectorAll('style, link[rel="stylesheet"]')).forEach(node => {
        if (node.tagName.toLowerCase() === 'link') {
          const link = node as HTMLLinkElement;
          stylesList.push(`<link rel="stylesheet" href="${link.href}">`);
        } else {
          stylesList.push(node.outerHTML);
        }
      });

      stylesList.push(`
        <style>
          @page {
            size: A4;
            margin: 10mm;
          }
          body {
            background: white !important;
            margin: 0;
            padding: 0;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .no-print {
            display: none !important;
          }
          #printable-report-document {
            box-shadow: none !important;
            border: 0 !important;
            width: 100% !important;
            max-width: none !important;
            margin: 0 !important;
            padding: 0 !important;
          }
        </style>
      `);

      const headContent = stylesList.join("\n");

      printWindow.document.write(`<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Relatório GEMBA ${selectedInspection.id}</title>
  ${headContent}
</head>
<body>
  ${element.outerHTML}
  <script>
    async function prepareAndPrint() {
      // 1. Wait for document fonts
      if (document.fonts && document.fonts.ready) {
        await document.fonts.ready;
      }

      // 2. Wait for stylesheets to load
      const links = Array.from(document.querySelectorAll('link[rel="stylesheet"]'));
      const linkPromises = links.map(link => {
        return new Promise(resolve => {
          if (link.sheet) {
            resolve();
          } else {
            link.onload = resolve;
            link.onerror = resolve;
          }
        });
      });
      await Promise.all(linkPromises);

      // 3. Wait for images to load and decode
      const images = Array.from(document.getElementsByTagName('img'));
      const imgPromises = images.map(img => {
        if (img.complete) {
          if (typeof img.decode === 'function') {
            return img.decode().catch(() => {});
          }
          return Promise.resolve();
        }
        return new Promise(resolve => {
          img.onload = () => {
            if (typeof img.decode === 'function') {
              img.decode().then(resolve).catch(resolve);
            } else {
              resolve();
            }
          };
          img.onerror = resolve;
        });
      });
      await Promise.all(imgPromises);

      // 4. Wait a little bit for everything to settle
      setTimeout(() => {
        window.print();
        window.close();
      }, 500);
    }

    if (document.readyState === 'complete') {
      prepareAndPrint();
    } else {
      window.addEventListener('load', prepareAndPrint);
    }
  </script>
</body>
</html>`);

      printWindow.document.close();
      printWindow.focus();
    } catch (err) {
      console.error("Erro ao preparar a impressão:", err);
      alert("Não foi possível carregar as imagens para a impressão.");
    } finally {
      setIsPreparingPrint(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in no-print-container">
      {/* View Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-100 pb-5 no-print">
        <div>
          <h1 className="text-xl font-extrabold text-[#0B2E59] tracking-tight">
            Relatórios de Inspeção GEMBA
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Geração automática de relatórios em formato PDF e impressão de auditorias de campo em padrão executivo.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleDownloadPDF}
            disabled={isGeneratingPDF || isPreparingPrint}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-[#F58220] hover:bg-[#d66f17] disabled:bg-gray-300 text-white text-xs font-black rounded-lg shadow cursor-pointer transition-colors"
          >
            <Download size={14} className={isGeneratingPDF ? "animate-bounce" : ""} />
            {isGeneratingPDF ? "Gerando PDF..." : "Gerar e Baixar PDF"}
          </button>
          <button
            onClick={handlePrint}
            disabled={isPreparingPrint || isGeneratingPDF}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-[#0B2E59] hover:bg-[#133e72] disabled:bg-gray-300 text-white text-xs font-black rounded-lg shadow cursor-pointer transition-colors"
          >
            <Printer size={14} className={isPreparingPrint ? "animate-spin" : ""} />
            {isPreparingPrint ? "Preparando relatório..." : "Abrir Impressão"}
          </button>
        </div>
      </div>

      {/* FILTER PANEL */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 space-y-4 no-print">
        <div className="flex items-center justify-between border-b border-gray-100 pb-3">
          <div className="flex items-center gap-2">
            <Filter size={16} className="text-[#F58220]" />
            <h2 className="text-xs font-bold text-[#0B2E59] uppercase tracking-wider">
              Filtros de Pesquisa
            </h2>
          </div>
          {(selectedSupervisor || selectedArea || selectedTipo || selectedStatus || selectedPotencial || startDate || endDate || selectedMonth || selectedYear) && (
            <button
              onClick={handleClearFilters}
              className="flex items-center gap-1.5 px-3 py-1 bg-red-50 hover:bg-red-100 text-red-600 text-[10px] font-black rounded-lg transition-colors cursor-pointer"
            >
              <XCircle size={12} /> Limpar Filtros
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {/* Supervisor */}
          <div className="flex flex-col gap-1 text-[11px]">
            <label className="font-extrabold text-gray-500 uppercase tracking-wide">Supervisor</label>
            <select
              value={selectedSupervisor}
              onChange={(e) => setSelectedSupervisor(e.target.value)}
              className="bg-gray-50 border border-gray-200 rounded-lg p-2 text-gray-700 font-bold focus:outline-none focus:ring-1 focus:ring-[#0B2E59] transition-all"
            >
              <option value="">Todos os Relatórios</option>
              {supervisors.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nome}
                </option>
              ))}
            </select>
          </div>

          {/* Localidade / Área */}
          <div className="flex flex-col gap-1 text-[11px]">
            <label className="font-extrabold text-gray-500 uppercase tracking-wide">Localidade / Área</label>
            <select
              value={selectedArea}
              onChange={(e) => setSelectedArea(e.target.value)}
              className="bg-gray-50 border border-gray-200 rounded-lg p-2 text-gray-700 font-bold focus:outline-none focus:ring-1 focus:ring-[#0B2E59] transition-all"
            >
              <option value="">Todos os Relatórios</option>
              {areas.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nome}
                </option>
              ))}
            </select>
          </div>

          {/* Tipo de Lançamento */}
          <div className="flex flex-col gap-1 text-[11px]">
            <label className="font-extrabold text-gray-500 uppercase tracking-wide">Tipo de Lançamento</label>
            <select
              value={selectedTipo}
              onChange={(e) => setSelectedTipo(e.target.value)}
              className="bg-gray-50 border border-gray-200 rounded-lg p-2 text-gray-700 font-bold focus:outline-none focus:ring-1 focus:ring-[#0B2E59] transition-all"
            >
              <option value="">Todos os Relatórios</option>
              {uniqueTipos.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          {/* Status */}
          <div className="flex flex-col gap-1 text-[11px]">
            <label className="font-extrabold text-gray-500 uppercase tracking-wide">Status</label>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="bg-gray-50 border border-gray-200 rounded-lg p-2 text-gray-700 font-bold focus:outline-none focus:ring-1 focus:ring-[#0B2E59] transition-all"
            >
              <option value="">Todos os Relatórios</option>
              <option value="Aberto">Aberto</option>
              <option value="Em andamento">Em andamento</option>
              <option value="Concluído">Concluído</option>
            </select>
          </div>

          {/* Potencial */}
          <div className="flex flex-col gap-1 text-[11px]">
            <label className="font-extrabold text-gray-500 uppercase tracking-wide">Potencial</label>
            <select
              value={selectedPotencial}
              onChange={(e) => setSelectedPotencial(e.target.value)}
              className="bg-gray-50 border border-gray-200 rounded-lg p-2 text-gray-700 font-bold focus:outline-none focus:ring-1 focus:ring-[#0B2E59] transition-all"
            >
              <option value="">Todos os Relatórios</option>
              <option value="Leve">Leve</option>
              <option value="Médio">Médio</option>
              <option value="Grave">Grave</option>
              <option value="Crítico">Crítico</option>
            </select>
          </div>

          {/* Data Inicial */}
          <div className="flex flex-col gap-1 text-[11px]">
            <label className="font-extrabold text-gray-500 uppercase tracking-wide">Data Inicial</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="bg-gray-50 border border-gray-200 rounded-lg p-1.5 text-gray-700 font-bold focus:outline-none focus:ring-1 focus:ring-[#0B2E59] transition-all"
            />
          </div>

          {/* Data Final */}
          <div className="flex flex-col gap-1 text-[11px]">
            <label className="font-extrabold text-gray-500 uppercase tracking-wide">Data Final</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="bg-gray-50 border border-gray-200 rounded-lg p-1.5 text-gray-700 font-bold focus:outline-none focus:ring-1 focus:ring-[#0B2E59] transition-all"
            />
          </div>

          {/* Mês */}
          <div className="flex flex-col gap-1 text-[11px]">
            <label className="font-extrabold text-gray-500 uppercase tracking-wide">Mês</label>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="bg-gray-50 border border-gray-200 rounded-lg p-2 text-gray-700 font-bold focus:outline-none focus:ring-1 focus:ring-[#0B2E59] transition-all"
            >
              <option value="">Todos os Meses</option>
              <option value="01">Janeiro</option>
              <option value="02">Fevereiro</option>
              <option value="03">Março</option>
              <option value="04">Abril</option>
              <option value="05">Maio</option>
              <option value="06">Junho</option>
              <option value="07">Julho</option>
              <option value="08">Agosto</option>
              <option value="09">Setembro</option>
              <option value="10">Outubro</option>
              <option value="11">Novembro</option>
              <option value="12">Dezembro</option>
            </select>
          </div>

          {/* Ano */}
          <div className="flex flex-col gap-1 text-[11px]">
            <label className="font-extrabold text-gray-500 uppercase tracking-wide">Ano</label>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              className="bg-gray-50 border border-gray-200 rounded-lg p-2 text-gray-700 font-bold focus:outline-none focus:ring-1 focus:ring-[#0B2E59] transition-all"
            >
              <option value="">Todos os Anos</option>
              {uniqueYears.map((yr) => (
                <option key={yr} value={yr}>
                  {yr}
                </option>
              ))}
            </select>
          </div>

          {/* Clear Filters Button */}
          <div className="flex items-end justify-start">
            <button
              onClick={handleClearFilters}
              className="w-full py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-black text-xs rounded-lg transition-colors cursor-pointer shadow-2xs border border-gray-200"
            >
              Limpar Filtros
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* LEFT COLUMN: INSPECTIONS SELECTOR (Hidden in Print) */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 space-y-4 h-[75vh] flex flex-col no-print">
          <div className="flex items-center justify-between border-b border-gray-50 pb-3">
            <div className="flex items-center gap-2">
              <FileText size={16} className="text-[#F58220]" />
              <h2 className="text-xs font-bold text-[#0B2E59] uppercase tracking-wider">
                Selecionar Inspeção
              </h2>
            </div>
            <span className="px-2 py-0.5 bg-[#0B2E59] text-white rounded text-[10px] font-bold">
              {filteredInspections.length}
            </span>
          </div>

          <div className="flex-1 overflow-y-auto space-y-2">
            {filteredInspections.map((item) => {
              const isActive = item.id === selectedId;
              return (
                <button
                  key={item.id}
                  onClick={() => setSelectedId(item.id)}
                  className={`w-full text-left p-3 rounded-lg border transition-all text-xs flex flex-col gap-1 cursor-pointer ${
                    isActive
                      ? "bg-blue-50/70 border-[#0B2E59] shadow-sm font-semibold"
                      : "border-gray-100 hover:bg-gray-50 text-gray-700"
                  }`}
                >
                  <div className="flex justify-between items-center w-full">
                    <span className="font-bold text-[#0B2E59]">{item.id.toUpperCase()}</span>
                    <span className="text-[10px] text-gray-400 font-semibold">
                      {item.data.split("-").reverse().join("/")}
                    </span>
                  </div>
                  <span className="text-gray-800 font-semibold truncate w-full">
                    Supervisor: {getSupervisorName(item.supervisorId)}
                  </span>
                  <span className="text-[10px] text-gray-500 truncate w-full">
                    {item.descricao}
                  </span>
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className="px-1 py-0.2 bg-slate-100 rounded text-[9px] font-bold text-slate-700">
                      {item.tipo}
                    </span>
                    <span
                      className={`px-1 py-0.2 rounded text-[9px] font-bold ${
                        item.status === "Concluído"
                          ? "bg-green-50 text-green-700"
                          : "bg-red-50 text-red-700"
                      }`}
                    >
                      {item.status}
                    </span>
                  </div>
                </button>
              );
            })}
            {filteredInspections.length === 0 && (
              <p className="text-xs text-gray-400 text-center py-10 font-medium">
                {inspections.length === 0 
                  ? "Nenhuma inspeção disponível no sistema." 
                  : "Nenhuma inspeção atende aos filtros."}
              </p>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: HIGH-FIDELITY PRINT PREVIEW DOCUMENT (Letter/A4 Size Mockup) */}
        <div className="lg:col-span-2 flex justify-center w-full">
          {selectedInspection ? (
            <div
              id="printable-report-document"
              className="bg-white rounded-xl shadow-md border border-gray-200 p-8 w-full max-w-[800px] font-sans print:shadow-none print:border-none print:p-0 relative"
            >
              {/* 
                We structure the entire printable document within a native <table>.
                This is a robust, cross-browser CSS print approach:
                - thead elements repeat automatically at the top of EVERY printed page (Running Header).
                - tfoot elements repeat automatically at the bottom of EVERY printed page (Running Footer).
                - tbody contains the actual multi-page flowing content.
              */}
              <table className="w-full border-collapse">
                
                {/* 1. REPEATING FIXED HEADER ON PRINT */}
                <thead className="hidden print:table-header-group">
                  <tr>
                    <td>
                      <div className="flex justify-between items-center border-b-4 border-[#0B2E59] pb-4 mb-6">
                        <div className="flex items-center gap-3">
                          {/* Corporate Vector Logo in infinite quality */}
                          <div className="bg-[#F58220] text-white font-black text-2xl px-3 py-1 rounded shadow-sm tracking-tighter flex items-center justify-center">
                            FTA
                          </div>
                          <div className="flex flex-col leading-tight border-l border-gray-200 pl-3">
                            <span className="text-xs font-black text-gray-800 tracking-wide uppercase">
                              SERVIÇOS INDUSTRIAIS
                            </span>
                            <span className="text-[9px] text-[#F58220] font-bold uppercase tracking-widest">
                              SISTEMA DE GESTÃO GEMBA
                            </span>
                          </div>
                        </div>

                        <div className="text-right">
                          <h2 className="text-sm font-black text-[#0B2E59] uppercase tracking-wide">
                            RELATÓRIO DE INSPEÇÃO GEMBA
                          </h2>
                          <span className="text-[9px] font-extrabold text-gray-400 bg-gray-50 px-2.5 py-0.5 rounded-md">
                            DOCUMENTO ID: {selectedInspection.id.toUpperCase()}
                          </span>
                        </div>
                      </div>
                    </td>
                  </tr>
                </thead>

                {/* 2. DYNAMIC CONTENT SECTION */}
                <tbody>
                  <tr>
                    <td>
                      {/* SCREEN-ONLY BRAND HEADER (Hidden in Print to let repeating header take over) */}
                      <div className="flex print:hidden justify-between items-center border-b-4 border-[#0B2E59] pb-4 mb-6">
                        <div className="flex items-center gap-3">
                          <div className="bg-[#F58220] text-white font-black text-2xl px-3 py-1 rounded shadow-sm tracking-tighter flex items-center justify-center">
                            FTA
                          </div>
                          <div className="flex flex-col leading-tight border-l border-gray-200 pl-3">
                            <span className="text-xs font-black text-gray-800 tracking-wide uppercase">
                              SERVIÇOS INDUSTRIAIS
                            </span>
                            <span className="text-[9px] text-[#F58220] font-bold uppercase tracking-widest">
                              SISTEMA DE GESTÃO GEMBA
                            </span>
                          </div>
                        </div>

                        <div className="text-right">
                          <h2 className="text-base font-black text-[#0B2E59] uppercase tracking-wide">
                            RELATÓRIO DE INSPEÇÃO GEMBA
                          </h2>
                          <span className="text-[10px] font-extrabold text-gray-400 bg-gray-50 px-2.5 py-1 rounded-md">
                            DOCUMENTO ID: {selectedInspection.id.toUpperCase()}
                          </span>
                        </div>
                      </div>

                      {/* MAIN REPORT BODY */}
                      <div className="space-y-5 text-xs text-gray-700">
                        {/* CORE METADATA GRID */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-y-4 gap-x-2 border-b border-gray-100 pb-5 mb-5 metadata-grid">
                          <div className="p-1">
                            <span className="block text-[9px] uppercase font-bold text-gray-400 tracking-wider">Supervisor</span>
                            <span className="font-extrabold text-gray-900">{getSupervisorName(selectedInspection.supervisorId)}</span>
                          </div>
                          <div className="p-1">
                            <span className="block text-[9px] uppercase font-bold text-gray-400 tracking-wider">Área Operacional</span>
                            <span className="font-extrabold text-gray-900">{getAreaName(selectedInspection.areaId)}</span>
                          </div>
                          <div className="p-1">
                            <span className="block text-[9px] uppercase font-bold text-gray-400 tracking-wider">Contrato Associado</span>
                            <span className="font-extrabold text-gray-900">{getContractCode(selectedInspection.contratoId)}</span>
                          </div>
                          <div className="p-1">
                            <span className="block text-[9px] uppercase font-bold text-gray-400 tracking-wider">
                              {isPresenca ? "Data de Registro" : (isDSS ? "Data do DSS" : "Data de Inspeção")}
                            </span>
                            <span className="font-extrabold text-[#0B2E59]">{selectedInspection.data.split("-").reverse().join("/")}</span>
                          </div>

                          {isPresenca ? (
                            <>
                              <div className="p-1">
                                <span className="block text-[9px] uppercase font-bold text-gray-400 tracking-wider">Tipo de Lançamento</span>
                                <span className="font-bold text-gray-900">Presença em Campo</span>
                              </div>
                              <div className="p-1 col-span-2">
                                <span className="block text-[9px] uppercase font-bold text-gray-400 tracking-wider">Nº de Participantes Abordados</span>
                                <span className="font-bold text-gray-900">{selectedInspection.quantidadeParticipantes ?? "Não Informado"} colaboradores</span>
                              </div>
                            </>
                          ) : isDSS ? (
                            <>
                              <div className="p-1">
                                <span className="block text-[9px] uppercase font-bold text-gray-400 tracking-wider">Tema do DSS</span>
                                <span className="font-bold text-gray-900">{selectedInspection.temaDSS || "Não Informado"}</span>
                              </div>
                              <div className="p-1">
                                <span className="block text-[9px] uppercase font-bold text-gray-400 tracking-wider">Nº de Participantes</span>
                                <span className="font-bold text-gray-900">{selectedInspection.quantidadeParticipantes ?? "Não Informado"}</span>
                              </div>
                            </>
                          ) : (
                            <>
                              <div className="p-1">
                                <span className="block text-[9px] uppercase font-bold text-gray-400 tracking-wider">Atividade / Check-list</span>
                                <span className="font-bold text-gray-900">{selectedInspection.atividade}</span>
                              </div>
                              <div className="p-1">
                                <span className="block text-[9px] uppercase font-bold text-gray-400 tracking-wider">Classificação do Desvio</span>
                                <span className="font-bold text-gray-900">{selectedInspection.tipo}</span>
                              </div>
                              <div className="p-1">
                                <span className="block text-[9px] uppercase font-bold text-gray-400 tracking-wider">Potencial Risco</span>
                                <span className="font-black text-orange-600 uppercase">{selectedInspection.potencial}</span>
                              </div>
                              <div className="p-1">
                                <span className="block text-[9px] uppercase font-bold text-gray-400 tracking-wider">Status Atual</span>
                                <span
                                  className={`inline-block px-2 py-0.5 rounded text-[9px] font-black uppercase ${
                                    selectedInspection.status === "Concluído"
                                      ? "bg-green-100 text-green-800"
                                      : "bg-red-100 text-red-800"
                                  }`}
                                >
                                  {selectedInspection.status}
                                </span>
                              </div>
                            </>
                          )}
                        </div>

                        {/* DESCRIPTIVE AND STRATEGIC BLOCKS */}
                        <div className="space-y-4">
                          <div className="space-y-1">
                            <span className="block text-[9px] font-extrabold text-slate-400 uppercase tracking-widest">
                              {isPresenca ? "1. Descrição da Presença em Campo" : (isDSS ? "1. Descrição Detalhada do DSS (Pautas e Alinhamentos)" : "1. Descrição do Desvio / Ocorrência Observada")}
                            </span>
                            <p className="text-xs text-gray-700 bg-gray-50/50 p-3.5 rounded-lg leading-relaxed border border-gray-100 font-normal">
                              {selectedInspection.descricao}
                            </p>
                          </div>

                          {isPresenca ? (
                            selectedInspection.observacoes && (
                              <div className="space-y-1">
                                <span className="block text-[9px] font-extrabold text-slate-400 uppercase tracking-widest">
                                  2. Observações Gerais / Complementares
                                </span>
                                <p className="text-xs text-gray-600 bg-gray-50/30 p-2.5 px-3.5 rounded-lg italic border border-gray-100/40">
                                  {selectedInspection.observacoes}
                                </p>
                              </div>
                            )
                          ) : isDSS ? (
                            selectedInspection.observacoes && (
                              <div className="space-y-1">
                                <span className="block text-[9px] font-extrabold text-slate-400 uppercase tracking-widest">
                                  2. Observações Gerais / Complementares
                                </span>
                                <p className="text-xs text-gray-600 bg-gray-50/30 p-2.5 px-3.5 rounded-lg italic border border-gray-100/40">
                                  {selectedInspection.observacoes}
                                </p>
                              </div>
                            )
                          ) : (
                            <>
                              <div className="space-y-1">
                                <span className="block text-[9px] font-extrabold text-slate-400 uppercase tracking-widest">
                                  2. Ação Corretiva Realizada / Recomendada
                                </span>
                                <p className="text-xs text-gray-700 bg-gray-50/50 p-3.5 rounded-lg leading-relaxed border border-gray-100 font-normal">
                                  {selectedInspection.acaoCorretiva}
                                </p>
                              </div>

                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-1">
                                  <span className="block text-[9px] font-extrabold text-slate-400 uppercase tracking-widest">
                                    3. Responsável Técnico & Prazo Limite
                                  </span>
                                  <p className="text-xs text-gray-700 bg-gray-50/50 px-3.5 py-2.5 rounded-lg border border-gray-100 font-semibold">
                                    Responsável: <span className="text-[#0B2E59] font-bold">{selectedInspection.responsavel}</span> <br/> 
                                    {selectedInspection.status === "Concluído" ? (
                                      <>
                                        Data de Conclusão: <span className="text-[#16a34a] font-bold">{selectedInspection.dataConclusao ? selectedInspection.dataConclusao.split("-").reverse().join("/") : selectedInspection.data.split("-").reverse().join("/")}</span>
                                      </>
                                    ) : (
                                      <>
                                        Prazo Adequação: <span className="text-orange-600 font-bold">{selectedInspection.prazo.split("-").reverse().join("/")}</span>
                                      </>
                                    )}
                                  </p>
                                </div>

                                {selectedInspection.observacoes && (
                                  <div className="space-y-1">
                                    <span className="block text-[9px] font-extrabold text-slate-400 uppercase tracking-widest">
                                      4. Observações Complementares
                                    </span>
                                    <p className="text-xs text-gray-600 bg-gray-50/30 p-2.5 px-3.5 rounded-lg italic border border-gray-100/40">
                                      {selectedInspection.observacoes}
                                    </p>
                                  </div>
                                 )}
                               </div>
                             </>
                           )}
                         </div>

                        {/* PHOTO GRID WITH AUTOMATIC ORGANIZER (Avois slicing over page-breaks) */}
                        <div className={`grid gap-5 pt-4 border-t border-gray-100 break-inside-avoid page-break-inside-avoid photo-container-grid ${(isDSS || isPresenca) ? "grid-cols-1 max-w-xl mx-auto" : "grid-cols-1 md:grid-cols-2"}`}>
                          {isPresenca ? (
                            <PhotoGrid title="Fotos da Presença em Campo" photos={selectedInspection.fotosAntes || []} isBefore={false} rotations={selectedInspection.rotacoesFotosAntes} />
                          ) : isDSS ? (
                            <PhotoGrid title="Evidências do DSS (Registro Fotográfico)" photos={selectedInspection.fotosAntes || []} isBefore={false} rotations={selectedInspection.rotacoesFotosAntes} />
                          ) : (
                            <>
                              <PhotoGrid title="Registro Fotográfico - Antes" photos={selectedInspection.fotosAntes || []} isBefore={true} rotations={selectedInspection.rotacoesFotosAntes} />
                              <PhotoGrid title="Registro Fotográfico - Depois (Tratado)" photos={selectedInspection.fotosDepois || []} isBefore={false} rotations={selectedInspection.rotacoesFotosDepois} />
                            </>
                          )}
                        </div>

                          {/* SIGNATURES & APPROVAL SECTION */}
                          <div className="signature-section flex flex-col items-center justify-center pt-6 pb-4 border-t border-gray-100 text-center text-xs text-gray-500 break-inside-avoid page-break-inside-avoid">
                            <div className="flex flex-col items-center justify-center space-y-1">
                              <div className="signature-img-container mx-auto w-[190px] h-[75px] flex items-center justify-center relative select-none">
                                <img 
                                  src={assinaturaJhonata} 
                                  alt="" 
                                  className="signature-img report-signature-image max-w-[190px] max-h-[75px] w-auto h-auto object-contain" 
                                  referrerPolicy="no-referrer"
                                />
                              </div>
                              {/* Horizontal line with 240px width */}
                              <div className="signature-line w-[240px] border-t border-gray-300 my-1 mx-auto"></div>
                              <span className="signature-name block font-bold text-[#0B2E59] text-[14px]">
                                Jhonata Santos
                              </span>
                              <span className="signature-role text-[10px] font-bold block text-slate-700 uppercase tracking-wide">
                                GERENTE OPERACIONAL DOS CONTRATOS
                              </span>
                              <span className="signature-company text-[10px] font-bold block text-slate-500 uppercase tracking-wider">
                                FTA SERVIÇOS INDUSTRIAIS
                              </span>
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  </tbody>

                {/* 3. REPEATING FIXED FOOTER ON PRINT */}
                <tfoot className="hidden print:table-footer-group">
                  <tr>
                    <td>
                      <div className="pt-3 border-t border-gray-100 flex items-center justify-between text-[8px] text-gray-400 font-semibold mt-6 uppercase tracking-wider">
                        <div className="flex flex-col gap-0.5 text-left">
                          <span>Relatório Gerado Eletronicamente pelo GEMBA FTA</span>
                          <span>Emitente: <span className="text-gray-500 font-extrabold">Arthur Santos</span> | Gerado em: <span className="text-gray-500 font-extrabold">{reportGenerationTime}</span></span>
                        </div>
                        <div className="flex flex-col items-end gap-0.5 text-right">
                          <span className="font-extrabold text-gray-500">{config.nomeEmpresa}</span>
                          <span>Página <span className="print-page-num font-bold"></span></span>
                        </div>
                      </div>
                    </td>
                  </tr>
                </tfoot>
              </table>

              {/* FOOTER SECTION */}
              <div className="text-center text-[10px] text-gray-400 pt-6 mt-6 border-t border-gray-100 flex items-center justify-between font-semibold select-none print:mt-4 print:pt-4">
                <div className="flex flex-col gap-0.5 text-left">
                  <span>Relatório Gerado Eletronicamente pelo GEMBA FTA</span>
                  <span>Emitente: <span className="text-gray-500 font-extrabold">Arthur Santos</span> | Gerado em: <span className="text-gray-500 font-extrabold">{reportGenerationTime}</span></span>
                </div>
                <div className="flex flex-col items-end gap-0.5 text-right">
                  <span className="font-extrabold uppercase tracking-widest text-gray-500">
                    {config.nomeEmpresa}
                  </span>
                  <span>Visualização Digital</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center p-12 bg-white rounded-xl shadow-sm border border-gray-100 w-full">
              <FileText className="text-gray-300 mb-2" size={48} />
              <p className="text-xs text-gray-400 font-bold text-center">
                Selecione uma inspeção para gerar o relatório.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
