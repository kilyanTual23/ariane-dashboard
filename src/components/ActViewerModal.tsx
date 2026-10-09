"use client";

import { useEffect, useRef, useState, useCallback, useTransition } from "react";
import ReactMarkdown from "react-markdown";
import {
  appendTranscriptionToNotesAction,
  saveTranscriptionToRecordAction,
} from "@/app/actions";
import {
  parseTranscription,
  splitFullName,
  type ExtractedActData,
} from "@/lib/transcription-parser";

interface ViewState {
  scale: number;
  pan: { x: number; y: number };
}

interface CropBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function ActViewerModal({
  isOpen,
  onClose,
  imageUrl,
  title,
  originalUrl,
  downloadFilename,
  slug,
  personId,
  unionId,
  actKind,
}: {
  isOpen: boolean;
  onClose: () => void;
  imageUrl: string;
  title: string;
  originalUrl?: string | null;
  downloadFilename?: string;
  slug?: string;
  personId?: number;
  unionId?: number;
  actKind?: "birth" | "death" | "marriage";
}) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 });

  const [view, setView] = useState<ViewState>({
    scale: 1,
    pan: { x: 0, y: 0 },
  });
  const [rotation, setRotation] = useState(0);
  const [highContrast, setHighContrast] = useState(false);
  const [invert, setInvert] = useState(false);
  const [grayscale, setGrayscale] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // Outils OCR & Sélection
  const [ocrOpen, setOcrOpen] = useState(false);
  const [mode, setMode] = useState<"pan" | "select">("pan");
  const [cropBox, setCropBox] = useState<CropBox | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const selectStartRef = useRef<{ clientX: number; clientY: number }>({ clientX: 0, clientY: 0 });

  // État de l'OCR
  const [ocrEngine, setOcrEngine] = useState<"tesseract" | "gemini">("gemini");
  const [geminiApiKey, setGeminiApiKey] = useState("");
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrProgress, setOcrProgress] = useState("");
  const [ocrElapsed, setOcrElapsed] = useState(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [transcription, setTranscription] = useState("");
  const [editMode, setEditMode] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [pendingSave, startSaveTransition] = useTransition();

  // Données structurées extraites pour la fiche
  const [extractedData, setExtractedData] = useState<ExtractedActData | null>(null);
  const [fieldDate, setFieldDate] = useState("");
  const [fieldPlace, setFieldPlace] = useState("");
  const [fieldBirthDate, setFieldBirthDate] = useState("");
  const [fieldBirthPlace, setFieldBirthPlace] = useState("");
  const [fieldDeathDate, setFieldDeathDate] = useState("");
  const [fieldDeathPlace, setFieldDeathPlace] = useState("");
  const [fieldGivenNames, setFieldGivenNames] = useState("");
  const [fieldSurname, setFieldSurname] = useState("");
  const [fieldOccupation, setFieldOccupation] = useState("");

  // Père
  const [fieldFather, setFieldFather] = useState("");
  const [fieldFatherOccupation, setFieldFatherOccupation] = useState("");
  const [fatherIsDeceased, setFatherIsDeceased] = useState(false);
  const [fieldFatherDeathDate, setFieldFatherDeathDate] = useState("");
  const [fieldFatherDeathPlace, setFieldFatherDeathPlace] = useState("");
  const [fieldFatherBirthDate, setFieldFatherBirthDate] = useState("");
  const [fieldFatherBirthPlace, setFieldFatherBirthPlace] = useState("");
  const [createFather, setCreateFather] = useState(true);

  // Mère
  const [fieldMother, setFieldMother] = useState("");
  const [fieldMotherOccupation, setFieldMotherOccupation] = useState("");
  const [motherIsDeceased, setMotherIsDeceased] = useState(false);
  const [fieldMotherDeathDate, setFieldMotherDeathDate] = useState("");
  const [fieldMotherDeathPlace, setFieldMotherDeathPlace] = useState("");
  const [fieldMotherBirthDate, setFieldMotherBirthDate] = useState("");
  const [fieldMotherBirthPlace, setFieldMotherBirthPlace] = useState("");
  const [createMother, setCreateMother] = useState(true);

  // Conjoint & Mariage
  const [fieldSpouse, setFieldSpouse] = useState("");
  const [fieldMarriageDate, setFieldMarriageDate] = useState("");
  const [fieldMarriagePlace, setFieldMarriagePlace] = useState("");
  const [createUnion, setCreateUnion] = useState(true);

  const [appendToNotes, setAppendToNotes] = useState(true);
  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string | null>(null);
  const [saveErrorMessage, setSaveErrorMessage] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const modalRootRef = useRef<HTMLDivElement>(null);

  // Appliquer les données extraites aux champs de formulaire
  const applyParsedData = useCallback((parsed: ExtractedActData) => {
    setExtractedData(parsed);

    // Événement principal
    const evDate = parsed.event_date || (actKind === "death" ? parsed.death_date_raw : actKind === "marriage" ? parsed.marriage_date_raw : parsed.birth_date_raw) || "";
    const evPlace = parsed.event_place || (actKind === "death" ? parsed.death_place : actKind === "marriage" ? parsed.marriage_place : parsed.birth_place) || "";
    if (evDate) setFieldDate(evDate);
    if (evPlace) setFieldPlace(evPlace);

    // Sujet
    if (parsed.given_names) setFieldGivenNames(parsed.given_names);
    if (parsed.surname) setFieldSurname(parsed.surname.toLocaleUpperCase("fr"));
    if (parsed.occupation) setFieldOccupation(parsed.occupation);

    // Naissance du sujet
    const bDate = parsed.birth_date_raw || (actKind === "birth" ? evDate : "");
    const bPlace = parsed.birth_place || (actKind === "birth" ? evPlace : "");
    if (bDate) setFieldBirthDate(bDate);
    if (bPlace) setFieldBirthPlace(bPlace);

    // Décès du sujet (ou mention marginale de décès)
    const dDate = parsed.death_date_raw || parsed.marginal_death_date || (actKind === "death" ? evDate : "");
    const dPlace = parsed.death_place || parsed.marginal_death_place || (actKind === "death" ? evPlace : "");
    if (dDate) setFieldDeathDate(dDate);
    if (dPlace) setFieldDeathPlace(dPlace);

    // Père
    const fSurname = parsed.father_surname ? parsed.father_surname.toLocaleUpperCase("fr") : "";
    const fName = parsed.father_given_names || fSurname
      ? `${parsed.father_given_names || ""} ${fSurname}`.trim()
      : "";
    if (fName) {
      setFieldFather(fName);
      setCreateFather(true);
    }
    if (parsed.father_occupation) setFieldFatherOccupation(parsed.father_occupation);
    if (parsed.father_is_deceased !== undefined) setFatherIsDeceased(Boolean(parsed.father_is_deceased));
    if (parsed.father_death_date_raw) setFieldFatherDeathDate(parsed.father_death_date_raw);
    if (parsed.father_death_place) setFieldFatherDeathPlace(parsed.father_death_place);
    if (parsed.father_birth_date_raw) setFieldFatherBirthDate(parsed.father_birth_date_raw);
    if (parsed.father_birth_place) setFieldFatherBirthPlace(parsed.father_birth_place);
    if (parsed.father_death_date_raw || parsed.father_death_place) {
      setFatherIsDeceased(true);
    }

    // Mère
    const mSurname = parsed.mother_surname ? parsed.mother_surname.toLocaleUpperCase("fr") : "";
    const mName = parsed.mother_given_names || mSurname
      ? `${parsed.mother_given_names || ""} ${mSurname}`.trim()
      : "";
    if (mName) {
      setFieldMother(mName);
      setCreateMother(true);
    }
    if (parsed.mother_occupation) setFieldMotherOccupation(parsed.mother_occupation);
    if (parsed.mother_is_deceased !== undefined) setMotherIsDeceased(Boolean(parsed.mother_is_deceased));
    if (parsed.mother_death_date_raw) setFieldMotherDeathDate(parsed.mother_death_date_raw);
    if (parsed.mother_death_place) setFieldMotherDeathPlace(parsed.mother_death_place);
    if (parsed.mother_birth_date_raw) setFieldMotherBirthDate(parsed.mother_birth_date_raw);
    if (parsed.mother_birth_place) setFieldMotherBirthPlace(parsed.mother_birth_place);
    if (parsed.mother_death_date_raw || parsed.mother_death_place) {
      setMotherIsDeceased(true);
    }

    // Conjoint & Mariage (ou mention marginale de mariage)
    const spSurname = parsed.spouse_surname ? parsed.spouse_surname.toLocaleUpperCase("fr") : "";
    const spName = parsed.spouse_given_names || spSurname
      ? `${parsed.spouse_given_names || ""} ${spSurname}`.trim()
      : (parsed.marginal_marriage_spouse || "");
    const mDate = parsed.marriage_date_raw || parsed.marginal_marriage_date || (actKind === "marriage" ? evDate : "");
    const mPlace = parsed.marriage_place || parsed.marginal_marriage_place || (actKind === "marriage" ? evPlace : "");
    if (spName) setFieldSpouse(spName);
    if (mDate) setFieldMarriageDate(mDate);
    if (mPlace) setFieldMarriagePlace(mPlace);
    if (spName || mDate || mPlace) setCreateUnion(true);
  }, [actKind]);

  // Récupérer la clé Gemini enregistrée dans localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedKey = localStorage.getItem("ariane_gemini_api_key");
      if (savedKey) setGeminiApiKey(savedKey);
    }
  }, []);

  // Synchroniser automatiquement les champs dès qu'une transcription est présente
  useEffect(() => {
    if (transcription && !fieldDate && !fieldPlace && !fieldFather && !fieldMother) {
      const parsed = parseTranscription(transcription);
      applyParsedData(parsed);
    }
  }, [transcription, fieldDate, fieldPlace, fieldFather, fieldMother, applyParsedData]);

  const handleSaveGeminiKey = (val: string) => {
    setGeminiApiKey(val);
    if (typeof window !== "undefined") {
      localStorage.setItem("ariane_gemini_api_key", val.trim());
    }
  };

  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({
    clientX: 0,
    clientY: 0,
    initialPanX: 0,
    initialPanY: 0,
  });

  const getFitScale = useCallback(() => {
    if (!containerRef.current || !naturalSize.width || !naturalSize.height) return 0.5;
    const padding = 32;
    const cw = Math.max(100, containerRef.current.clientWidth - padding);
    const ch = Math.max(100, containerRef.current.clientHeight - padding);

    const isRotated = rotation === 90 || rotation === 270;
    const imgW = isRotated ? naturalSize.height : naturalSize.width;
    const imgH = isRotated ? naturalSize.width : naturalSize.height;

    return Math.min(cw / imgW, ch / imgH);
  }, [naturalSize, rotation]);

  const screenToImage = useCallback(
    (screenX: number, screenY: number) => {
      const container = containerRef.current;
      if (!container || !naturalSize.width || !naturalSize.height) return { x: 0, y: 0 };

      const rect = container.getBoundingClientRect();
      const w = container.clientWidth;
      const h = container.clientHeight;

      let dx = screenX - rect.left - (w / 2 + view.pan.x);
      let dy = screenY - rect.top - (h / 2 + view.pan.y);

      if (rotation !== 0) {
        const rad = (-rotation * Math.PI) / 180;
        const rx = dx * Math.cos(rad) - dy * Math.sin(rad);
        const ry = dx * Math.sin(rad) + dy * Math.cos(rad);
        dx = rx;
        dy = ry;
      }

      const ix = dx / view.scale + naturalSize.width / 2;
      const iy = dy / view.scale + naturalSize.height / 2;

      return {
        x: Math.max(0, Math.min(naturalSize.width, Math.round(ix))),
        y: Math.max(0, Math.min(naturalSize.height, Math.round(iy))),
      };
    },
    [naturalSize, view, rotation],
  );

  const imageToScreen = useCallback(
    (imgX: number, imgY: number) => {
      const container = containerRef.current;
      if (!container || !naturalSize.width || !naturalSize.height) return { x: 0, y: 0 };

      const w = container.clientWidth;
      const h = container.clientHeight;

      let dx = (imgX - naturalSize.width / 2) * view.scale;
      let dy = (imgY - naturalSize.height / 2) * view.scale;

      if (rotation !== 0) {
        const rad = (rotation * Math.PI) / 180;
        const rx = dx * Math.cos(rad) - dy * Math.sin(rad);
        const ry = dx * Math.sin(rad) + dy * Math.cos(rad);
        dx = rx;
        dy = ry;
      }

      return {
        x: Math.round(w / 2 + view.pan.x + dx),
        y: Math.round(h / 2 + view.pan.y + dy),
      };
    },
    [naturalSize, view, rotation],
  );

  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !imageUrl) return;

    setLoading(true);
    setLoadError(null);
    const img = new Image();
    img.src = imageUrl;

    img.onload = () => {
      setImage(img);
      setNaturalSize({ width: img.naturalWidth, height: img.naturalHeight });
      setLoading(false);

      if (containerRef.current) {
        const padding = 32;
        const cw = Math.max(100, containerRef.current.clientWidth - padding);
        const ch = Math.max(100, containerRef.current.clientHeight - padding);
        const fit = Math.min(cw / img.naturalWidth, ch / img.naturalHeight);
        setView({ scale: fit, pan: { x: 0, y: 0 } });
      }
    };

    img.onerror = () => {
      setLoading(false);
      setLoadError("Impossible de charger la prévisualisation de l'acte.");
    };

    return () => {
      img.onload = null;
      img.onerror = null;
    };
  }, [isOpen, imageUrl]);

  useEffect(() => {
    if (isOpen) {
      setRotation(0);
      setHighContrast(false);
      setInvert(false);
      setGrayscale(false);
      setIsDragging(false);
      isDraggingRef.current = false;
      setCropBox(null);
      setMode("pan");
    }
  }, [isOpen]);

  const handleFit = useCallback(() => {
    const fit = getFitScale();
    setView({ scale: fit, pan: { x: 0, y: 0 } });
  }, [getFitScale]);

  const handleActualSize = useCallback(() => {
    setView((prev) => ({ scale: 1, pan: { x: prev.pan.x, y: prev.pan.y } }));
  }, []);

  const handleRotateCW = useCallback(() => {
    setRotation((r) => (r + 90) % 360);
  }, []);

  const handleRotateCCW = useCallback(() => {
    setRotation((r) => (r + 270) % 360);
  }, []);

  const handleButtonZoom = useCallback((factor: number) => {
    setView((prev) => {
      const nextScale = Math.max(0.04, Math.min(10.0, prev.scale * factor));
      const actualFactor = nextScale / prev.scale;
      return {
        scale: nextScale,
        pan: {
          x: prev.pan.x * actualFactor,
          y: prev.pan.y * actualFactor,
        },
      };
    });
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || !image) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = container.clientWidth;
    const h = container.clientHeight;

    const targetW = Math.round(w * dpr);
    const targetH = Math.round(h * dpr);

    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    ctx.translate(w / 2 + view.pan.x, h / 2 + view.pan.y);

    if (rotation !== 0) {
      ctx.rotate((rotation * Math.PI) / 180);
    }

    ctx.scale(view.scale, view.scale);

    ctx.drawImage(
      image,
      -image.naturalWidth / 2,
      -image.naturalHeight / 2,
      image.naturalWidth,
      image.naturalHeight,
    );

    ctx.restore();
  }, [image, view, rotation]);

  useEffect(() => {
    if (!isOpen) return;
    draw();
  }, [isOpen, draw]);

  useEffect(() => {
    if (!isOpen) return;
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(() => {
      draw();
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [isOpen, draw]);

  useEffect(() => {
    if (!isOpen) return;
    const container = containerRef.current;
    if (!container) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = container.getBoundingClientRect();
      const mouseX = e.clientX - (rect.left + rect.width / 2);
      const mouseY = e.clientY - (rect.top + rect.height / 2);

      const zoomDelta = -e.deltaY * 0.002;
      const factor = Math.exp(zoomDelta);

      setView((prev) => {
        const nextScale = Math.max(0.04, Math.min(10.0, prev.scale * factor));
        const actualFactor = nextScale / prev.scale;

        return {
          scale: nextScale,
          pan: {
            x: mouseX - (mouseX - prev.pan.x) * actualFactor,
            y: mouseY - (mouseY - prev.pan.y) * actualFactor,
          },
        };
      });
    };

    container.addEventListener("wheel", onWheel, { passive: false });
    return () => container.removeEventListener("wheel", onWheel);
  }, [isOpen]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;

    if (mode === "select") {
      setIsSelecting(true);
      selectStartRef.current = { clientX: e.clientX, clientY: e.clientY };
      const startPt = screenToImage(e.clientX, e.clientY);
      setCropBox({ x: startPt.x, y: startPt.y, width: 0, height: 0 });
    } else {
      isDraggingRef.current = true;
      setIsDragging(true);
      dragStartRef.current = {
        clientX: e.clientX,
        clientY: e.clientY,
        initialPanX: view.pan.x,
        initialPanY: view.pan.y,
      };
    }
  };

  useEffect(() => {
    if (!isOpen) return;

    const onMouseMove = (e: MouseEvent) => {
      if (mode === "select" && isSelecting) {
        const p1 = screenToImage(selectStartRef.current.clientX, selectStartRef.current.clientY);
        const p2 = screenToImage(e.clientX, e.clientY);

        const x = Math.min(p1.x, p2.x);
        const y = Math.min(p1.y, p2.y);
        const width = Math.abs(p2.x - p1.x);
        const height = Math.abs(p2.y - p1.y);

        setCropBox({ x, y, width, height });
      } else if (mode === "pan" && isDraggingRef.current) {
        const dx = e.clientX - dragStartRef.current.clientX;
        const dy = e.clientY - dragStartRef.current.clientY;
        setView((prev) => ({
          ...prev,
          pan: {
            x: dragStartRef.current.initialPanX + dx,
            y: dragStartRef.current.initialPanY + dy,
          },
        }));
      }
    };

    const onMouseUp = () => {
      if (isSelecting) {
        setIsSelecting(false);
      }
      if (isDraggingRef.current) {
        isDraggingRef.current = false;
        setIsDragging(false);
      }
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [isOpen, mode, isSelecting, screenToImage]);

  const handleDoubleClick = (e: React.MouseEvent) => {
    if (mode === "select") return;

    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const mouseX = e.clientX - (rect.left + rect.width / 2);
    const mouseY = e.clientY - (rect.top + rect.height / 2);
    const fitScale = getFitScale();

    setView((prev) => {
      if (prev.scale < 0.85) {
        const targetScale = 1.0;
        const factor = targetScale / prev.scale;
        return {
          scale: targetScale,
          pan: {
            x: mouseX - (mouseX - prev.pan.x) * factor,
            y: mouseY - (mouseY - prev.pan.y) * factor,
          },
        };
      } else {
        return {
          scale: fitScale,
          pan: { x: 0, y: 0 },
        };
      }
    });
  };

  const toggleFullscreen = () => {
    if (!modalRootRef.current) return;
    if (!document.fullscreenElement) {
      modalRootRef.current.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener("fullscreenchange", handleFsChange);
    return () => document.removeEventListener("fullscreenchange", handleFsChange);
  }, []);

  const handleCancelOcr = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setOcrLoading(false);
    setOcrProgress("");
    setOcrElapsed(0);
  };

  const handleRunOcr = async () => {
    if (!imageUrl) return;
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const ac = new AbortController();
    abortControllerRef.current = ac;

    setOcrLoading(true);
    setOcrElapsed(0);
    setOcrProgress("Préparation de l'acte…");
    setSaveSuccess(false);

    const startTime = Date.now();
    const timer = setInterval(() => {
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      setOcrElapsed(elapsed);
      if (ocrEngine === "gemini") {
        if (elapsed >= 15) {
          setOcrProgress(`Finalisation de la transcription (${elapsed}s)…`);
        } else if (elapsed >= 7) {
          setOcrProgress(`Transcription et analyse généalogique (${elapsed}s)…`);
        } else if (elapsed >= 3) {
          setOcrProgress(`Déchiffrage paléographique par l'IA (${elapsed}s)…`);
        }
      } else {
        setOcrProgress(`Analyse Tesseract (${elapsed}s)…`);
      }
    }, 1000);

    try {
      const res = await fetch("/api/ocr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: ac.signal,
        body: JSON.stringify({
          imageUrl,
          crop: cropBox && cropBox.width > 20 && cropBox.height > 20 ? cropBox : undefined,
          engine: ocrEngine,
          apiKey: geminiApiKey.trim() || undefined,
          language: "fra",
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Erreur lors de la transcription");
      }

      setTranscription(data.text || "Aucun texte détecté.");
      setEditMode(false);

      // Pré-remplissage automatique des champs généalogiques à partir de l'analyse
      const parsed: ExtractedActData = data.extractedData || parseTranscription(data.text || "");
      applyParsedData(parsed);
    } catch (err: unknown) {
      if (ac.signal.aborted) {
        setTranscription("Transcription interrompue.");
        return;
      }
      const msg = err instanceof Error ? err.message : String(err);
      setTranscription(`⚠️ Erreur : ${msg}`);
    } finally {
      clearInterval(timer);
      setOcrLoading(false);
      setOcrProgress("");
      setOcrElapsed(0);
      abortControllerRef.current = null;
    }
  };

  const handleSyncFromTranscription = () => {
    if (!transcription) return;
    const parsed = parseTranscription(transcription);
    applyParsedData(parsed);
  };

  const handleCopyTranscription = () => {
    if (!transcription) return;
    navigator.clipboard.writeText(transcription);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  const handleSaveToRecord = () => {
    if (!slug) return;
    setSaveSuccessMessage(null);
    setSaveErrorMessage(null);

    startSaveTransition(async () => {
      const fd = new FormData();
      fd.append("slug", slug);
      if (personId) fd.append("personId", String(personId));
      if (unionId) fd.append("unionId", String(unionId));
      if (actKind) fd.append("actKind", actKind);

      // Acte / Événement principal
      if (fieldDate.trim()) fd.append("date_raw", fieldDate.trim());
      if (fieldPlace.trim()) fd.append("place", fieldPlace.trim());

      // Sujet
      if (fieldGivenNames.trim()) fd.append("given_names", fieldGivenNames.trim());
      if (fieldSurname.trim()) fd.append("surname", fieldSurname.trim().toLocaleUpperCase("fr"));
      if (fieldOccupation.trim()) fd.append("occupation", fieldOccupation.trim());
      if (fieldBirthDate.trim()) fd.append("birth_date_raw", fieldBirthDate.trim());
      if (fieldBirthPlace.trim()) fd.append("birth_place", fieldBirthPlace.trim());
      if (fieldDeathDate.trim()) fd.append("death_date_raw", fieldDeathDate.trim());
      if (fieldDeathPlace.trim()) fd.append("death_place", fieldDeathPlace.trim());

      // Père
      if (fieldFather.trim()) {
        const fParts = splitFullName(fieldFather.trim());
        fd.append("father_given_names", fParts.given_names);
        fd.append("father_surname", fParts.surname);
        fd.append("create_father", createFather ? "1" : "0");
      }
      if (fieldFatherOccupation.trim()) fd.append("father_occupation", fieldFatherOccupation.trim());
      if (fatherIsDeceased) fd.append("father_is_deceased", "1");
      if (fieldFatherDeathDate.trim()) fd.append("father_death_date_raw", fieldFatherDeathDate.trim());
      if (fieldFatherDeathPlace.trim()) fd.append("father_death_place", fieldFatherDeathPlace.trim());
      if (fieldFatherBirthDate.trim()) fd.append("father_birth_date_raw", fieldFatherBirthDate.trim());
      if (fieldFatherBirthPlace.trim()) fd.append("father_birth_place", fieldFatherBirthPlace.trim());

      // Mère
      if (fieldMother.trim()) {
        const mParts = splitFullName(fieldMother.trim());
        fd.append("mother_given_names", mParts.given_names);
        fd.append("mother_surname", mParts.surname);
        fd.append("create_mother", createMother ? "1" : "0");
      }
      if (fieldMotherOccupation.trim()) fd.append("mother_occupation", fieldMotherOccupation.trim());
      if (motherIsDeceased) fd.append("mother_is_deceased", "1");
      if (fieldMotherDeathDate.trim()) fd.append("mother_death_date_raw", fieldMotherDeathDate.trim());
      if (fieldMotherDeathPlace.trim()) fd.append("mother_death_place", fieldMotherDeathPlace.trim());
      if (fieldMotherBirthDate.trim()) fd.append("mother_birth_date_raw", fieldMotherBirthDate.trim());
      if (fieldMotherBirthPlace.trim()) fd.append("mother_birth_place", fieldMotherBirthPlace.trim());

      // Conjoint & Mariage
      if (fieldSpouse.trim()) {
        const sParts = splitFullName(fieldSpouse.trim());
        fd.append("spouse_given_names", sParts.given_names);
        fd.append("spouse_surname", sParts.surname);
      }
      if (fieldMarriageDate.trim()) fd.append("marriage_date_raw", fieldMarriageDate.trim());
      if (fieldMarriagePlace.trim()) fd.append("marriage_place", fieldMarriagePlace.trim());
      fd.append("create_union", createUnion ? "1" : "0");

      fd.append("append_to_notes", appendToNotes ? "1" : "0");
      fd.append("transcription_text", transcription);

      const res = await saveTranscriptionToRecordAction(fd);
      if (res.ok) {
        const updated = res.updatedFields?.length
          ? res.updatedFields.join(", ")
          : "Fiche mise à jour";
        setSaveSuccessMessage(`✓ Enregistré : ${updated} !`);
        setTimeout(() => setSaveSuccessMessage(null), 5000);
      } else {
        setSaveErrorMessage(res.error || "Erreur lors de l'enregistrement");
      }
    });
  };

  const handleSaveToNotes = () => {
    if (!transcription || !slug) return;
    startSaveTransition(async () => {
      const fd = new FormData();
      fd.append("slug", slug);
      if (personId) fd.append("personId", String(personId));
      if (unionId) fd.append("unionId", String(unionId));
      fd.append("text", transcription);

      const res = await appendTranscriptionToNotesAction(fd);
      if (res.ok) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      }
    });
  };

  if (!isOpen) return null;

  const filterStyles = [
    grayscale ? "grayscale(100%)" : "",
    highContrast ? "contrast(165%) brightness(95%)" : "",
    invert ? "invert(100%) hue-rotate(180deg)" : "",
  ]
    .filter(Boolean)
    .join(" ");

  let screenCrop: { left: number; top: number; width: number; height: number } | null = null;
  if (cropBox && cropBox.width > 0 && cropBox.height > 0) {
    const pt1 = imageToScreen(cropBox.x, cropBox.y);
    const pt2 = imageToScreen(cropBox.x + cropBox.width, cropBox.y + cropBox.height);
    screenCrop = {
      left: Math.min(pt1.x, pt2.x),
      top: Math.min(pt1.y, pt2.y),
      width: Math.abs(pt2.x - pt1.x),
      height: Math.abs(pt2.y - pt1.y),
    };
  }

  return (
    <div
      ref={modalRootRef}
      className="fixed inset-0 z-50 flex flex-col bg-bg/95 backdrop-blur-md select-none text-fg font-sans"
    >
      {/* Barre d'outils supérieure dans la DA sobre d'Ariane */}
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-surface px-4 py-2.5 shrink-0 z-20 shadow-xs">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="text-sm font-medium text-fg truncate max-w-xs sm:max-w-md">
            {title}
          </span>
          {naturalSize.width > 0 && (
            <span className="hidden sm:inline-flex text-[11px] rounded bg-surface-2 px-2 py-0.5 text-fg-muted font-normal">
              {naturalSize.width} × {naturalSize.height} px
            </span>
          )}
        </div>

        {/* Contrôles du Viewer */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Zoom */}
          <div className="flex items-center rounded-lg border border-border bg-surface-2 p-0.5">
            <button
              type="button"
              onClick={() => handleButtonZoom(1 / 1.25)}
              className="rounded px-2 py-1 text-xs font-semibold text-fg hover:bg-surface-3 transition-colors"
              title="Dézoomer (-)"
            >
              −
            </button>
            <span className="min-w-14 text-center text-xs font-medium text-fg">
              {Math.round(view.scale * 100)} %
            </span>
            <button
              type="button"
              onClick={() => handleButtonZoom(1.25)}
              className="rounded px-2 py-1 text-xs font-semibold text-fg hover:bg-surface-3 transition-colors"
              title="Zoomer (+)"
            >
              +
            </button>
            <button
              type="button"
              onClick={handleFit}
              className="rounded px-2 py-1 text-xs text-fg-muted hover:bg-surface-3 hover:text-fg transition-colors"
              title="Ajuster à la fenêtre"
            >
              Ajuster
            </button>
            <button
              type="button"
              onClick={handleActualSize}
              className={`rounded px-2 py-1 text-xs transition-colors ${
                Math.round(view.scale * 100) === 100
                  ? "bg-fg text-accent-fg font-medium shadow-xs"
                  : "text-fg-muted hover:bg-surface-3 hover:text-fg"
              }`}
              title="Taille réelle 1:1 netteté maximale"
            >
              100%
            </button>
          </div>

          {/* Rotation */}
          <div className="flex items-center rounded-lg border border-border bg-surface-2 p-0.5">
            <button
              type="button"
              onClick={handleRotateCCW}
              className="rounded px-1.5 py-1 text-xs text-fg hover:bg-surface-3 transition-colors"
              title="Pivoter à gauche"
            >
              ↺
            </button>
            <button
              type="button"
              onClick={handleRotateCW}
              className="rounded px-2 py-1 text-xs font-medium text-fg hover:bg-surface-3 transition-colors"
              title="Pivoter à droite"
            >
              ↻ {rotation !== 0 ? `${rotation}°` : "90°"}
            </button>
          </div>

          {/* Filtres de lisibilité */}
          <button
            type="button"
            onClick={() => setHighContrast((v) => !v)}
            className={`rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${
              highContrast
                ? "border-fg bg-fg text-accent-fg font-medium"
                : "border-border bg-surface text-fg hover:bg-surface-2"
            }`}
            title="Contraste renforcé"
          >
            ◐ Contraste
          </button>

          <button
            type="button"
            onClick={() => setInvert((v) => !v)}
            className={`rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${
              invert
                ? "border-fg bg-fg text-accent-fg font-medium"
                : "border-border bg-surface text-fg hover:bg-surface-2"
            }`}
            title="Mode Négatif"
          >
            ◑ Négatif
          </button>

          <button
            type="button"
            onClick={() => setGrayscale((v) => !v)}
            className={`hidden sm:inline-flex rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${
              grayscale
                ? "border-fg bg-fg text-accent-fg font-medium"
                : "border-border bg-surface text-fg hover:bg-surface-2"
            }`}
            title="Niveaux de gris"
          >
            N&B
          </button>

          <span className="hidden sm:inline h-4 w-px bg-border mx-0.5" />

          {/* Bouton OCR / Transcription */}
          <button
            type="button"
            onClick={() => setOcrOpen((v) => !v)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-all ${
              ocrOpen
                ? "border-fg bg-fg text-accent-fg shadow-xs"
                : "border-border bg-surface-2 text-fg hover:bg-surface-3"
            }`}
            title="Ouvrir le panneau de transcription et d'OCR"
          >
            📝 Transcription OCR
          </button>

          {/* Plein écran */}
          <button
            type="button"
            onClick={toggleFullscreen}
            className="rounded-lg border border-border bg-surface px-2 py-1.5 text-xs text-fg hover:bg-surface-2"
            title="Plein écran"
          >
            {isFullscreen ? "🗗" : "⛶"}
          </button>

          {/* Permalien d'archives */}
          {originalUrl && (
            <a
              href={originalUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs text-fg-muted hover:text-fg hover:bg-surface-2"
              title="Ouvrir le permalien sur le site des archives"
            >
              Archives ↗
            </a>
          )}

          {/* Téléchargement */}
          <a
            href={imageUrl}
            download={downloadFilename ?? "acte.jpg"}
            className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-fg hover:bg-surface-2 shadow-2xs"
            title="Télécharger l'image JPEG originale"
          >
            💾
          </a>

          {/* Fermer */}
          <button
            type="button"
            onClick={onClose}
            className="ml-1 rounded-lg p-1.5 text-fg-subtle hover:text-fg hover:bg-surface-2"
            title="Fermer la visionneuse (Échap)"
          >
            ✕
          </button>
        </div>
      </header>

      {/* Corps du Viewer (Canvas + Panneau OCR latéral) */}
      <div className="relative flex-1 flex overflow-hidden">
        {/* Zone Canvas Interactive avec fond neutre élégant */}
        <main
          ref={containerRef}
          onMouseDown={handleMouseDown}
          onDoubleClick={handleDoubleClick}
          className={`relative flex-1 overflow-hidden w-full h-full bg-surface-2/70 ${
            mode === "select"
              ? "cursor-crosshair"
              : isDragging
                ? "cursor-grabbing"
                : "cursor-grab"
          }`}
        >
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-surface/70 backdrop-blur-2xs z-20">
              <span className="text-sm font-medium text-fg animate-pulse">
                Chargement de l'acte haute définition…
              </span>
            </div>
          )}

          {loadError && !loading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-surface/95 backdrop-blur-sm z-20 p-6 text-center">
              <span className="text-3xl mb-3">📄</span>
              <p className="text-sm font-semibold text-fg">{loadError}</p>
              <p className="mt-1.5 max-w-md text-xs text-fg-muted">
                Le document n'a pas pu être prévisualisé directement. Assurez-vous que le lien Google Drive est partagé avec « Tous les utilisateurs disposant du lien ».
              </p>
              {originalUrl && (
                <a
                  href={originalUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-fg px-3.5 py-2 text-xs font-medium text-accent-fg hover:opacity-90 transition-opacity"
                >
                  <span>Ouvrir dans Google Drive</span>
                  <span>↗</span>
                </a>
              )}
            </div>
          )}

          <canvas
            ref={canvasRef}
            style={{
              filter: filterStyles || undefined,
            }}
            className="w-full h-full block"
          />

          {/* Boîte de sélection de zone (Crop box) dans la DA sobre */}
          {screenCrop && (
            <div
              style={{
                left: screenCrop.left,
                top: screenCrop.top,
                width: screenCrop.width,
                height: screenCrop.height,
              }}
              className="absolute pointer-events-none border-2 border-fg bg-fg/10 shadow-lg transition-all"
            >
              <span className="absolute -top-6 left-0 rounded bg-fg px-2 py-0.5 text-[10.5px] font-medium text-accent-fg shadow-xs">
                Zone ({cropBox?.width} × {cropBox?.height} px)
              </span>
            </div>
          )}

          {/* Barre d'outils flottante de mode (Main vs Sélection) */}
          <div className="absolute bottom-4 left-6 z-10 flex items-center gap-1.5 rounded-full border border-border bg-surface/90 p-1 backdrop-blur-md shadow-md">
            <button
              type="button"
              onClick={() => setMode("pan")}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs transition-colors ${
                mode === "pan"
                  ? "bg-fg text-accent-fg font-medium shadow-xs"
                  : "text-fg-muted hover:text-fg hover:bg-surface-2"
              }`}
            >
              <span>🖐️</span>
              <span>Déplacer</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("select");
                if (!ocrOpen) setOcrOpen(true);
              }}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs transition-colors ${
                mode === "select"
                  ? "bg-fg text-accent-fg font-medium shadow-xs"
                  : "text-fg-muted hover:text-fg hover:bg-surface-2"
              }`}
            >
              <span>🔲</span>
              <span>Sélectionner l’acte</span>
            </button>
            {cropBox && cropBox.width > 0 && (
              <button
                type="button"
                onClick={() => setCropBox(null)}
                className="rounded-full px-2.5 py-1.5 text-xs text-fg-subtle hover:text-fg hover:bg-surface-2"
                title="Effacer la sélection"
              >
                ✕ Effacer
              </button>
            )}
          </div>
        </main>

        {/* Panneau latéral OCR & Transcription parfaitement intégré à Ariane */}
        {ocrOpen && (
          <aside className="w-[420px] max-w-[90vw] border-l border-border bg-surface flex flex-col shrink-0 z-20 shadow-xl animate-in slide-in-from-right duration-200">
            {/* En-tête du panneau */}
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="text-base">📝</span>
                <h3 className="font-medium text-sm text-fg">Transcription & OCR</h3>
              </div>
              <button
                type="button"
                onClick={() => setOcrOpen(false)}
                className="rounded-lg p-1 text-fg-subtle hover:text-fg hover:bg-surface-2"
                title="Fermer le panneau"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 text-xs">
              {/* Choix de la zone */}
              <div className="rounded-xl border border-border bg-surface-2/50 p-3">
                <label className="font-medium text-fg block mb-1.5">
                  1. Zone à transcrire
                </label>
                {cropBox && cropBox.width > 20 && cropBox.height > 20 ? (
                  <div className="flex items-center justify-between gap-2 text-ok font-medium">
                    <span>
                      ✓ Rectangle sélectionné ({cropBox.width} × {cropBox.height} px)
                    </span>
                    <button
                      type="button"
                      onClick={() => setCropBox(null)}
                      className="text-fg-muted hover:text-fg underline text-[11px] font-normal"
                    >
                      Toute la page
                    </button>
                  </div>
                ) : (
                  <div className="text-fg-muted flex flex-col gap-1.5">
                    <p className="text-[11.5px] leading-relaxed">
                      Toute la page sera analysée. Pour isoler un acte précis, activez le bouton
                      « Sélectionner l'acte » en bas à gauche et glissez votre souris.
                    </p>
                    <button
                      type="button"
                      onClick={() => setMode("select")}
                      className="self-start rounded-lg border border-border bg-surface px-2.5 py-1 text-[11px] font-medium text-fg hover:bg-surface-2 transition-colors"
                    >
                      🔲 Tracer un rectangle sur l’acte
                    </button>
                  </div>
                )}
              </div>

              {/* Choix du moteur */}
              <div className="rounded-xl border border-border bg-surface-2/50 p-3 flex flex-col gap-2">
                <label className="font-medium text-fg block">
                  2. Moteur de transcription
                </label>

                <label
                  className={`flex cursor-pointer items-start gap-2.5 rounded-xl border p-2.5 transition-colors ${
                    ocrEngine === "gemini"
                      ? "border-fg bg-surface font-medium text-fg shadow-2xs"
                      : "border-border bg-surface/50 hover:bg-surface text-fg-muted"
                  }`}
                >
                  <input
                    type="radio"
                    name="ocrEngine"
                    checked={ocrEngine === "gemini"}
                    onChange={() => setOcrEngine("gemini")}
                    className="mt-0.5 accent-fg"
                  />
                  <div>
                    <div className="font-medium text-fg">✨ IA Paléographe (Gemini 3.8 Flash)</div>
                    <div className="text-[11px] text-fg-muted font-normal mt-0.5">
                      Transcription experte de l'écriture manuscrite ancienne (XVIe au XXe siècle).
                    </div>
                  </div>
                </label>

                <label
                  className={`flex cursor-pointer items-start gap-2.5 rounded-xl border p-2.5 transition-colors ${
                    ocrEngine === "tesseract"
                      ? "border-fg bg-surface font-medium text-fg shadow-2xs"
                      : "border-border bg-surface/50 hover:bg-surface text-fg-muted"
                  }`}
                >
                  <input
                    type="radio"
                    name="ocrEngine"
                    checked={ocrEngine === "tesseract"}
                    onChange={() => setOcrEngine("tesseract")}
                    className="mt-0.5 accent-fg"
                  />
                  <div>
                    <div className="font-medium text-fg">⚡ Tesseract (Local 100% hors-ligne)</div>
                    <div className="text-[11px] text-fg-muted font-normal mt-0.5">
                      Sans clé requise. Efficace pour les imprimés, tables décennales et formulaires.
                    </div>
                  </div>
                </label>

                {/* Saisie clé IA Vision */}
                {ocrEngine === "gemini" && (
                  <div className="mt-2 pt-2.5 border-t border-border flex flex-col gap-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] text-fg font-medium">
                        Clé API Vision (Gemini, Groq ou OpenAI) :
                      </label>
                      {geminiApiKey && (
                        <span className="text-[10px] text-ok font-medium">✓ Enregistrée</span>
                      )}
                    </div>
                    <input
                      type="password"
                      value={geminiApiKey}
                      onChange={(e) => handleSaveGeminiKey(e.target.value)}
                      placeholder="Collez votre clé Google AI Studio (AIza...), Groq (gsk_...) ou OpenAI (sk-...)…"
                      className="field w-full text-xs"
                    />
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] pt-0.5">
                      <a
                        href="https://aistudio.google.com/apikey"
                        target="_blank"
                        rel="noreferrer"
                        className="text-fg underline hover:text-fg-muted font-medium"
                      >
                        Obtenir une clé Google AI Studio ↗
                      </a>
                      <span className="text-fg-subtle">·</span>
                      <a
                        href="https://console.groq.com/keys"
                        target="_blank"
                        rel="noreferrer"
                        className="text-fg-muted underline hover:text-fg"
                      >
                        Alternative gratuite : Groq (1s, sans quota) ↗
                      </a>
                    </div>
                  </div>
                )}
              </div>

              {/* Bouton de lancement ou statut actif avec bouton Annuler */}
              {ocrLoading ? (
                <div className="flex items-center gap-2">
                  <div className="flex-1 flex items-center justify-center gap-2 rounded-xl border border-border bg-surface-2 py-2 px-3 text-xs font-medium text-fg shadow-2xs">
                    <span className="inline-block size-3 shrink-0 rounded-full border-2 border-fg border-t-transparent animate-spin" />
                    <span className="truncate">{ocrProgress || `Analyse en cours (${ocrElapsed}s)…`}</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleCancelOcr}
                    className="shrink-0 rounded-xl border border-border bg-surface px-3 py-2 text-xs font-medium text-fg-subtle hover:text-fg hover:bg-surface-2 transition-colors cursor-pointer"
                    title="Interrompre la transcription"
                  >
                    ✕ Annuler
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleRunOcr}
                  className="w-full rounded-xl bg-fg py-2.5 text-xs font-medium text-accent-fg transition-opacity hover:opacity-90 cursor-pointer shadow-xs"
                >
                  🔍 Lancer la transcription
                </button>
              )}

              {/* Résultat de la transcription avec rendu Markdown formaté */}
              {transcription && (
                <div className="flex-1 flex flex-col gap-2 rounded-xl border border-border bg-surface p-3 shadow-xs">
                  <div className="flex items-center justify-between border-b border-border pb-2">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-fg">Transcription</span>
                      <button
                        type="button"
                        onClick={() => setEditMode((v) => !v)}
                        className={`rounded px-1.5 py-0.5 text-[10.5px] transition-colors ${
                          editMode
                            ? "bg-fg text-accent-fg font-medium"
                            : "text-fg-subtle hover:text-fg hover:bg-surface-2"
                        }`}
                        title="Basculer entre l'affichage formaté et l'éditeur de texte brut"
                      >
                        {editMode ? "✓ Aperçu formaté" : "✎ Modifier texte"}
                      </button>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={handleCopyTranscription}
                        className="rounded-lg border border-border bg-surface px-2 py-1 text-[11px] text-fg hover:bg-surface-2 transition-colors"
                      >
                        {copySuccess ? "✓ Copié !" : "📋 Copier"}
                      </button>
                      {slug && (personId || unionId) && (
                        <button
                          type="button"
                          onClick={handleSaveToNotes}
                          disabled={pendingSave}
                          className="rounded-lg bg-fg text-accent-fg px-2.5 py-1 text-[11px] font-medium hover:opacity-90 transition-opacity"
                        >
                          {saveSuccess ? "✓ Enregistré !" : "💾 Enregistrer"}
                        </button>
                      )}
                    </div>
                  </div>

                  {editMode ? (
                    <textarea
                      rows={14}
                      value={transcription}
                      onChange={(e) => setTranscription(e.target.value)}
                      placeholder="La transcription s'affiche ici…"
                      className="field w-full rounded-lg p-2.5 text-xs font-mono leading-relaxed resize-none flex-1 min-h-[220px]"
                    />
                  ) : (
                    <div className="overflow-y-auto max-h-[380px] p-2 bg-surface-2/40 rounded-lg border border-border/60 text-xs text-fg leading-relaxed">
                      <ReactMarkdown
                        components={{
                          h1: ({ ...props }) => (
                            <h4 className="font-semibold text-fg text-sm mt-3 mb-1.5 first:mt-0" {...props} />
                          ),
                          h2: ({ ...props }) => (
                            <h4 className="font-semibold text-fg text-sm mt-3 mb-1.5 first:mt-0" {...props} />
                          ),
                          h3: ({ ...props }) => (
                            <h4 className="font-semibold text-fg text-[12.5px] mt-2.5 mb-1 text-fg pb-0.5 border-b border-border/80" {...props} />
                          ),
                          p: ({ ...props }) => (
                            <p className="my-1.5 text-fg leading-relaxed" {...props} />
                          ),
                          ul: ({ ...props }) => (
                            <ul className="list-disc pl-4 my-1.5 space-y-1 text-fg-muted" {...props} />
                          ),
                          ol: ({ ...props }) => (
                            <ol className="list-decimal pl-4 my-1.5 space-y-1 text-fg-muted" {...props} />
                          ),
                          li: ({ ...props }) => (
                            <li className="leading-relaxed" {...props} />
                          ),
                          strong: ({ ...props }) => (
                            <strong className="font-semibold text-fg" {...props} />
                          ),
                          blockquote: ({ ...props }) => (
                            <blockquote className="border-l-2 border-border pl-2.5 my-2 text-fg-muted italic" {...props} />
                          ),
                        }}
                      >
                        {transcription}
                      </ReactMarkdown>
                    </div>
                  )}

                  <p className="text-[10px] text-fg-subtle">
                    {editMode
                      ? "Vous éditez le texte source. Cliquez sur « Aperçu formaté » pour revoir le rendu."
                      : "Cliquez sur « ✎ Modifier texte » pour ajuster des mots ou corriger la transcription."}
                  </p>

                  {/* Synthèse des données extraites pour injection directe dans la fiche */}
                  {slug && (personId || unionId) && (
                    <div className="mt-2 flex flex-col gap-2.5 rounded-xl border border-border bg-surface-2/40 p-3">
                      <div className="flex items-center justify-between border-b border-border/80 pb-2">
                        <div className="flex items-center gap-1.5 font-semibold text-fg text-xs">
                          <span>📋</span>
                          <span>Champs détectés pour la fiche</span>
                        </div>
                        <button
                          type="button"
                          onClick={handleSyncFromTranscription}
                          className="text-[11px] text-fg-subtle hover:text-fg underline transition-colors"
                          title="Ré-analyser le texte pour actualiser les champs"
                        >
                          🔄 Ré-analyser
                        </button>
                      </div>

                      {/* Formulaire des champs à mettre à jour */}
                      <div className="flex flex-col gap-3">
                        {/* 1. Événement / Acte */}
                        <div className="rounded-lg border border-border/70 bg-surface/50 p-2.5 flex flex-col gap-2">
                          <span className="text-[11px] font-semibold text-fg flex items-center gap-1.5">
                            <span>📜</span>
                            <span>
                              {actKind === "death"
                                ? "Acte de décès"
                                : actKind === "marriage"
                                  ? "Acte de mariage"
                                  : "Acte de baptême / naissance"}
                            </span>
                          </span>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {/* Date principale */}
                            <div className="flex flex-col gap-1">
                              <label className="text-[10px] font-medium text-fg-muted flex items-center justify-between">
                                <span>📅 Date de l'acte :</span>
                                {fieldDate && <span className="text-[9px] text-ok">✓ Détecté</span>}
                              </label>
                              <input
                                type="text"
                                value={fieldDate}
                                onChange={(e) => setFieldDate(e.target.value)}
                                placeholder="ex: 14 février 1742"
                                className="field w-full text-xs"
                              />
                            </div>

                            {/* Lieu principal */}
                            <div className="flex flex-col gap-1">
                              <label className="text-[10px] font-medium text-fg-muted flex items-center justify-between">
                                <span>📍 Lieu / Paroisse :</span>
                                {fieldPlace && <span className="text-[9px] text-ok">✓ Détecté</span>}
                              </label>
                              <input
                                type="text"
                                value={fieldPlace}
                                onChange={(e) => setFieldPlace(e.target.value)}
                                placeholder="ex: Saint-Malo (Ille-et-Vilaine)"
                                className="field w-full text-xs"
                              />
                            </div>
                          </div>
                        </div>

                        {/* 2. Individu concerné */}
                        <div className="rounded-lg border border-border/70 bg-surface/50 p-2.5 flex flex-col gap-2">
                          <span className="text-[11px] font-semibold text-fg flex items-center gap-1.5">
                            <span>👤</span>
                            <span>Individu</span>
                          </span>

                          <div className="grid grid-cols-2 gap-2">
                            <div className="flex flex-col gap-1">
                              <label className="text-[10px] font-medium text-fg-muted flex items-center justify-between">
                                <span>Prénoms :</span>
                                {fieldGivenNames && <span className="text-[9px] text-ok">✓</span>}
                              </label>
                              <input
                                type="text"
                                value={fieldGivenNames}
                                onChange={(e) => setFieldGivenNames(e.target.value)}
                                placeholder="ex: Jean"
                                className="field w-full text-xs"
                              />
                            </div>
                            <div className="flex flex-col gap-1">
                              <label className="text-[10px] font-medium text-fg-muted flex items-center justify-between">
                                <span>Nom :</span>
                                {fieldSurname && <span className="text-[9px] text-ok">✓</span>}
                              </label>
                              <input
                                type="text"
                                value={fieldSurname}
                                onChange={(e) => setFieldSurname(e.target.value)}
                                placeholder="ex: Dupont"
                                className="field w-full text-xs"
                              />
                            </div>
                          </div>

                          <div className="flex flex-col gap-1">
                            <label className="text-[10px] font-medium text-fg-muted flex items-center justify-between">
                              <span>💼 Profession / Métier :</span>
                              {fieldOccupation && <span className="text-[9px] text-ok">✓</span>}
                            </label>
                            <input
                              type="text"
                              value={fieldOccupation}
                              onChange={(e) => setFieldOccupation(e.target.value)}
                              placeholder="ex: Laboureur, marinier..."
                              className="field w-full text-xs"
                            />
                          </div>

                          {/* Dates complémentaires de l'individu (naissance ou décès déduit / mention marginale) */}
                          {(actKind === "death" || fieldBirthDate || fieldBirthPlace) && (
                            <div className="grid grid-cols-2 gap-2 pt-1 border-t border-border/50">
                              <div className="flex flex-col gap-1">
                                <label className="text-[10px] font-medium text-fg-muted flex items-center justify-between">
                                  <span>👶 Date naiss. déduite :</span>
                                  {fieldBirthDate && <span className="text-[9px] text-ok">✓</span>}
                                </label>
                                <input
                                  type="text"
                                  value={fieldBirthDate}
                                  onChange={(e) => setFieldBirthDate(e.target.value)}
                                  placeholder="ex: vers 1712 ou 1712"
                                  className="field w-full text-xs"
                                />
                              </div>
                              <div className="flex flex-col gap-1">
                                <label className="text-[10px] font-medium text-fg-muted">
                                  <span>Lieu naiss. :</span>
                                </label>
                                <input
                                  type="text"
                                  value={fieldBirthPlace}
                                  onChange={(e) => setFieldBirthPlace(e.target.value)}
                                  placeholder="ex: Pleurtuit"
                                  className="field w-full text-xs"
                                />
                              </div>
                            </div>
                          )}

                          {(actKind === "birth" && (fieldDeathDate || fieldDeathPlace)) && (
                            <div className="grid grid-cols-2 gap-2 pt-1 border-t border-border/50">
                              <div className="flex flex-col gap-1">
                                <label className="text-[10px] font-medium text-fg-muted flex items-center justify-between">
                                  <span>✝ Mention décès :</span>
                                  {fieldDeathDate && <span className="text-[9px] text-ok">✓</span>}
                                </label>
                                <input
                                  type="text"
                                  value={fieldDeathDate}
                                  onChange={(e) => setFieldDeathDate(e.target.value)}
                                  placeholder="ex: 18 mai 1952"
                                  className="field w-full text-xs"
                                />
                              </div>
                              <div className="flex flex-col gap-1">
                                <label className="text-[10px] font-medium text-fg-muted">
                                  <span>Lieu décès :</span>
                                </label>
                                <input
                                  type="text"
                                  value={fieldDeathPlace}
                                  onChange={(e) => setFieldDeathPlace(e.target.value)}
                                  placeholder="ex: Rennes"
                                  className="field w-full text-xs"
                                />
                              </div>
                            </div>
                          )}
                        </div>

                        {/* 3. Parents (si sujet individuel) */}
                        {personId && (
                          <div className="flex flex-col gap-2.5">
                            {/* Père */}
                            <div className="rounded-lg border border-border/70 bg-surface/50 p-2.5 flex flex-col gap-2">
                              <div className="flex items-center justify-between">
                                <span className="text-[11px] font-semibold text-fg flex items-center gap-1.5">
                                  <span>👨</span>
                                  <span>Père</span>
                                </span>
                                <label className="flex items-center gap-1 text-[10.5px] text-fg cursor-pointer select-none">
                                  <input
                                    type="checkbox"
                                    checked={createFather}
                                    onChange={(e) => setCreateFather(e.target.checked)}
                                    className="accent-fg rounded"
                                  />
                                  <span className="font-medium">Créer & lier</span>
                                </label>
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                <div className="flex flex-col gap-1">
                                  <label className="text-[10px] font-medium text-fg-muted flex items-center justify-between">
                                    <span>Nom & Prénoms :</span>
                                    {fieldFather && <span className="text-[9px] text-ok">✓ Détecté</span>}
                                  </label>
                                  <input
                                    type="text"
                                    value={fieldFather}
                                    onChange={(e) => setFieldFather(e.target.value)}
                                    placeholder="ex: François Dupont"
                                    className="field w-full text-xs"
                                  />
                                </div>
                                <div className="flex flex-col gap-1">
                                  <label className="text-[10px] font-medium text-fg-muted flex items-center justify-between">
                                    <span>Métier :</span>
                                    {fieldFatherOccupation && <span className="text-[9px] text-ok">✓ Détecté</span>}
                                  </label>
                                  <input
                                    type="text"
                                    value={fieldFatherOccupation}
                                    onChange={(e) => setFieldFatherOccupation(e.target.value)}
                                    placeholder="ex: Journalier, laboureur"
                                    className="field w-full text-xs"
                                  />
                                </div>
                              </div>

                              {/* Statut décédé */}
                              <div className="flex items-center justify-between pt-0.5">
                                <label className="flex items-center gap-1.5 text-[10.5px] text-fg cursor-pointer select-none">
                                  <input
                                    type="checkbox"
                                    checked={fatherIsDeceased}
                                    onChange={(e) => setFatherIsDeceased(e.target.checked)}
                                    className="accent-fg rounded"
                                  />
                                  <span>✝ Feu / Défunt au moment de l'acte</span>
                                </label>
                              </div>

                              {/* Décès du père */}
                              <div className="grid grid-cols-2 gap-2 pt-1 border-t border-border/50">
                                <div className="flex flex-col gap-1">
                                  <label className="text-[10px] font-medium text-fg-muted flex items-center justify-between">
                                    <span>Date décès père :</span>
                                    {fieldFatherDeathDate && <span className="text-[9px] text-ok">✓ Détecté</span>}
                                  </label>
                                  <input
                                    type="text"
                                    value={fieldFatherDeathDate}
                                    onChange={(e) => {
                                      setFieldFatherDeathDate(e.target.value);
                                      if (e.target.value.trim()) setFatherIsDeceased(true);
                                    }}
                                    placeholder="ex: 14 janvier 1740 ou avant 1742"
                                    className="field w-full text-xs"
                                  />
                                </div>
                                <div className="flex flex-col gap-1">
                                  <label className="text-[10px] font-medium text-fg-muted flex items-center justify-between">
                                    <span>Lieu décès père :</span>
                                    {fieldFatherDeathPlace && <span className="text-[9px] text-ok">✓ Détecté</span>}
                                  </label>
                                  <input
                                    type="text"
                                    value={fieldFatherDeathPlace}
                                    onChange={(e) => {
                                      setFieldFatherDeathPlace(e.target.value);
                                      if (e.target.value.trim()) setFatherIsDeceased(true);
                                    }}
                                    placeholder="ex: Saint-Malo"
                                    className="field w-full text-xs"
                                  />
                                </div>
                              </div>

                              {/* Naissance du père */}
                              <div className="grid grid-cols-2 gap-2 pt-1 border-t border-border/50">
                                <div className="flex flex-col gap-1">
                                  <label className="text-[10px] font-medium text-fg-muted flex items-center justify-between">
                                    <span>Date / Âge naiss. père :</span>
                                    {fieldFatherBirthDate && <span className="text-[9px] text-ok">✓ Détecté</span>}
                                  </label>
                                  <input
                                    type="text"
                                    value={fieldFatherBirthDate}
                                    onChange={(e) => setFieldFatherBirthDate(e.target.value)}
                                    placeholder="ex: vers 1680 ou 1680"
                                    className="field w-full text-xs"
                                  />
                                </div>
                                <div className="flex flex-col gap-1">
                                  <label className="text-[10px] font-medium text-fg-muted flex items-center justify-between">
                                    <span>Lieu naiss. père :</span>
                                    {fieldFatherBirthPlace && <span className="text-[9px] text-ok">✓ Détecté</span>}
                                  </label>
                                  <input
                                    type="text"
                                    value={fieldFatherBirthPlace}
                                    onChange={(e) => setFieldFatherBirthPlace(e.target.value)}
                                    placeholder="ex: Paramé"
                                    className="field w-full text-xs"
                                  />
                                </div>
                              </div>
                            </div>

                            {/* Mère */}
                            <div className="rounded-lg border border-border/70 bg-surface/50 p-2.5 flex flex-col gap-2">
                              <div className="flex items-center justify-between">
                                <span className="text-[11px] font-semibold text-fg flex items-center gap-1.5">
                                  <span>👩</span>
                                  <span>Mère</span>
                                </span>
                                <label className="flex items-center gap-1 text-[10.5px] text-fg cursor-pointer select-none">
                                  <input
                                    type="checkbox"
                                    checked={createMother}
                                    onChange={(e) => setCreateMother(e.target.checked)}
                                    className="accent-fg rounded"
                                  />
                                  <span className="font-medium">Créer & lier</span>
                                </label>
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                <div className="flex flex-col gap-1">
                                  <label className="text-[10px] font-medium text-fg-muted flex items-center justify-between">
                                    <span>Nom & Prénoms :</span>
                                    {fieldMother && <span className="text-[9px] text-ok">✓ Détecté</span>}
                                  </label>
                                  <input
                                    type="text"
                                    value={fieldMother}
                                    onChange={(e) => setFieldMother(e.target.value)}
                                    placeholder="ex: Jeanne Martin"
                                    className="field w-full text-xs"
                                  />
                                </div>
                                <div className="flex flex-col gap-1">
                                  <label className="text-[10px] font-medium text-fg-muted flex items-center justify-between">
                                    <span>Métier :</span>
                                    {fieldMotherOccupation && <span className="text-[9px] text-ok">✓ Détecté</span>}
                                  </label>
                                  <input
                                    type="text"
                                    value={fieldMotherOccupation}
                                    onChange={(e) => setFieldMotherOccupation(e.target.value)}
                                    placeholder="ex: Ménagère, filandière"
                                    className="field w-full text-xs"
                                  />
                                </div>
                              </div>

                              {/* Statut décédée */}
                              <div className="flex items-center justify-between pt-0.5">
                                <label className="flex items-center gap-1.5 text-[10.5px] text-fg cursor-pointer select-none">
                                  <input
                                    type="checkbox"
                                    checked={motherIsDeceased}
                                    onChange={(e) => setMotherIsDeceased(e.target.checked)}
                                    className="accent-fg rounded"
                                  />
                                  <span>✝ Feue / Défunte au moment de l'acte</span>
                                </label>
                              </div>

                              {/* Décès de la mère */}
                              <div className="grid grid-cols-2 gap-2 pt-1 border-t border-border/50">
                                <div className="flex flex-col gap-1">
                                  <label className="text-[10px] font-medium text-fg-muted flex items-center justify-between">
                                    <span>Date décès mère :</span>
                                    {fieldMotherDeathDate && <span className="text-[9px] text-ok">✓ Détecté</span>}
                                  </label>
                                  <input
                                    type="text"
                                    value={fieldMotherDeathDate}
                                    onChange={(e) => {
                                      setFieldMotherDeathDate(e.target.value);
                                      if (e.target.value.trim()) setMotherIsDeceased(true);
                                    }}
                                    placeholder="ex: 2 mai 1745 ou avant 1742"
                                    className="field w-full text-xs"
                                  />
                                </div>
                                <div className="flex flex-col gap-1">
                                  <label className="text-[10px] font-medium text-fg-muted flex items-center justify-between">
                                    <span>Lieu décès mère :</span>
                                    {fieldMotherDeathPlace && <span className="text-[9px] text-ok">✓ Détecté</span>}
                                  </label>
                                  <input
                                    type="text"
                                    value={fieldMotherDeathPlace}
                                    onChange={(e) => {
                                      setFieldMotherDeathPlace(e.target.value);
                                      if (e.target.value.trim()) setMotherIsDeceased(true);
                                    }}
                                    placeholder="ex: Cancale"
                                    className="field w-full text-xs"
                                  />
                                </div>
                              </div>

                              {/* Naissance de la mère */}
                              <div className="grid grid-cols-2 gap-2 pt-1 border-t border-border/50">
                                <div className="flex flex-col gap-1">
                                  <label className="text-[10px] font-medium text-fg-muted flex items-center justify-between">
                                    <span>Date / Âge naiss. mère :</span>
                                    {fieldMotherBirthDate && <span className="text-[9px] text-ok">✓ Détecté</span>}
                                  </label>
                                  <input
                                    type="text"
                                    value={fieldMotherBirthDate}
                                    onChange={(e) => setFieldMotherBirthDate(e.target.value)}
                                    placeholder="ex: vers 1685 ou 1685"
                                    className="field w-full text-xs"
                                  />
                                </div>
                                <div className="flex flex-col gap-1">
                                  <label className="text-[10px] font-medium text-fg-muted flex items-center justify-between">
                                    <span>Lieu naiss. mère :</span>
                                    {fieldMotherBirthPlace && <span className="text-[9px] text-ok">✓ Détecté</span>}
                                  </label>
                                  <input
                                    type="text"
                                    value={fieldMotherBirthPlace}
                                    onChange={(e) => setFieldMotherBirthPlace(e.target.value)}
                                    placeholder="ex: Cancale"
                                    className="field w-full text-xs"
                                  />
                                </div>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* 4. Conjoint & Mariage */}
                        {(unionId || actKind === "marriage" || fieldSpouse || fieldMarriageDate || fieldMarriagePlace) && (
                          <div className="rounded-lg border border-border/70 bg-surface/50 p-2.5 flex flex-col gap-2">
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] font-semibold text-fg flex items-center gap-1.5">
                                <span>💍</span>
                                <span>Conjoint & Mariage</span>
                              </span>
                              {(fieldSpouse || fieldMarriageDate || fieldMarriagePlace) && (
                                <label className="flex items-center gap-1 text-[10.5px] text-fg cursor-pointer select-none">
                                  <input
                                    type="checkbox"
                                    checked={createUnion}
                                    onChange={(e) => setCreateUnion(e.target.checked)}
                                    className="accent-fg rounded"
                                  />
                                  <span className="font-medium">Enregistrer l'union</span>
                                </label>
                              )}
                            </div>

                            <div className="flex flex-col gap-1">
                              <label className="text-[10px] font-medium text-fg-muted flex items-center justify-between">
                                <span>Conjoint :</span>
                                {fieldSpouse && <span className="text-[9px] text-ok">✓</span>}
                              </label>
                              <input
                                type="text"
                                value={fieldSpouse}
                                onChange={(e) => setFieldSpouse(e.target.value)}
                                placeholder="ex: Marie Le Gall"
                                className="field w-full text-xs"
                              />
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                              <div className="flex flex-col gap-1">
                                <label className="text-[10px] font-medium text-fg-muted flex items-center justify-between">
                                  <span>Date mariage :</span>
                                  {fieldMarriageDate && <span className="text-[9px] text-ok">✓</span>}
                                </label>
                                <input
                                  type="text"
                                  value={fieldMarriageDate}
                                  onChange={(e) => setFieldMarriageDate(e.target.value)}
                                  placeholder="ex: 12 janvier 1745"
                                  className="field w-full text-xs"
                                />
                              </div>
                              <div className="flex flex-col gap-1">
                                <label className="text-[10px] font-medium text-fg-muted">
                                  <span>Lieu mariage :</span>
                                </label>
                                <input
                                  type="text"
                                  value={fieldMarriagePlace}
                                  onChange={(e) => setFieldMarriagePlace(e.target.value)}
                                  placeholder="ex: Cancale"
                                  className="field w-full text-xs"
                                />
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Case à cocher : enregistrer dans les notes */}
                        <label className="mt-0.5 flex items-center gap-2 cursor-pointer text-[11px] text-fg select-none">
                          <input
                            type="checkbox"
                            checked={appendToNotes}
                            onChange={(e) => setAppendToNotes(e.target.checked)}
                            className="accent-fg rounded"
                          />
                          <span>Ajouter la transcription intégrale dans les notes</span>
                        </label>
                      </div>

                      {/* Feedback succès / erreur */}
                      {saveSuccessMessage && (
                        <div className="rounded-lg bg-ok/10 border border-ok/30 p-2 text-center text-xs font-medium text-ok animate-in fade-in">
                          {saveSuccessMessage}
                        </div>
                      )}
                      {saveErrorMessage && (
                        <div className="rounded-lg bg-danger/10 border border-danger/30 p-2 text-center text-xs font-medium text-danger animate-in fade-in">
                          ⚠️ {saveErrorMessage}
                        </div>
                      )}

                      {/* Bouton Enregistrer dans la fiche */}
                      <button
                        type="button"
                        onClick={handleSaveToRecord}
                        disabled={pendingSave}
                        className="w-full mt-1 rounded-xl bg-fg py-2.5 px-3 text-xs font-medium text-accent-fg hover:opacity-90 disabled:opacity-50 transition-opacity shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        {pendingSave ? (
                          <>
                            <span className="inline-block size-3 rounded-full border-2 border-accent-fg border-t-transparent animate-spin" />
                            <span>Enregistrement dans la fiche…</span>
                          </>
                        ) : (
                          <>
                            <span>💾</span>
                            <span>Enregistrer dans les champs de la fiche</span>
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
