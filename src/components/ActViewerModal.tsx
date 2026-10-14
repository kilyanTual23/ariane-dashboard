"use client";

import { useEffect, useRef, useState, useCallback, useTransition } from "react";
import ReactMarkdown from "react-markdown";
import {
  appendTranscriptionToNotesAction,
  saveTranscriptionToRecordAction,
  getActViewerContextAction,
  type ActViewerContextData,
} from "@/app/actions";
import {
  parseTranscription,
  splitFullName,
  type ExtractedActData,
  type FieldSource,
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

  // Conjoint & Mariage (Partenaire 2)
  const [fieldSpouse, setFieldSpouse] = useState("");
  const [fieldSpouseOccupation, setFieldSpouseOccupation] = useState("");
  const [fieldSpouseBirthDate, setFieldSpouseBirthDate] = useState("");
  const [fieldSpouseBirthPlace, setFieldSpouseBirthPlace] = useState("");
  const [fieldMarriageDate, setFieldMarriageDate] = useState("");
  const [fieldMarriagePlace, setFieldMarriagePlace] = useState("");
  const [createUnion, setCreateUnion] = useState(true);

  // Parents du conjoint / épouse (Partenaire 2 pour les mariages)
  const [fieldSpouseFather, setFieldSpouseFather] = useState("");
  const [fieldSpouseFatherOccupation, setFieldSpouseFatherOccupation] = useState("");
  const [spouseFatherIsDeceased, setSpouseFatherIsDeceased] = useState(false);
  const [fieldSpouseMother, setFieldSpouseMother] = useState("");
  const [fieldSpouseMotherOccupation, setFieldSpouseMotherOccupation] = useState("");
  const [spouseMotherIsDeceased, setSpouseMotherIsDeceased] = useState(false);

  // Sélection des cases à valider dans l'Avant / Après
  const [selectedFieldKeys, setSelectedFieldKeys] = useState<Set<string>>(new Set());

  const [appendToNotes, setAppendToNotes] = useState(true);
  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string | null>(null);
  const [saveErrorMessage, setSaveErrorMessage] = useState<string | null>(null);

  // Contexte existant en base pour la comparaison Avant / Après
  const [currentContext, setCurrentContext] = useState<ActViewerContextData | null>(null);

  // État de survol pour le pointage interactif vers la source (texte et boîte sur l'image)
  const [hoveredSourceKey, setHoveredSourceKey] = useState<string | null>(null);
  const [hoveredSourceBox, setHoveredSourceBox] = useState<{ ymin: number; xmin: number; ymax: number; xmax: number } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const modalRootRef = useRef<HTMLDivElement>(null);

  // Charger le contexte actuel de la personne et/ou union pour la comparaison Avant/Après
  useEffect(() => {
    if (!isOpen || !slug) return;
    getActViewerContextAction(slug, personId, unionId)
      .then((data) => setCurrentContext(data))
      .catch((err) => console.warn("Erreur chargement contexte acte:", err));
  }, [isOpen, slug, personId, unionId]);

  // Appliquer les données extraites aux champs de formulaire et pré-cocher les propositions
  const applyParsedData = useCallback((parsed: ExtractedActData) => {
    setExtractedData(parsed);
    const newKeys = new Set<string>();

    // Événement principal
    const evDate = parsed.event_date || (actKind === "death" ? parsed.death_date_raw : actKind === "marriage" ? parsed.marriage_date_raw : parsed.birth_date_raw) || "";
    const evPlace = parsed.event_place || (actKind === "death" ? parsed.death_place : actKind === "marriage" ? parsed.marriage_place : parsed.birth_place) || "";
    if (evDate) {
      setFieldDate(evDate);
      newKeys.add("date");
    }
    if (evPlace) {
      setFieldPlace(evPlace);
      newKeys.add("place");
    }

    // Sujet / Époux 1
    if (parsed.given_names) {
      setFieldGivenNames(parsed.given_names);
      newKeys.add("name");
    }
    if (parsed.surname) {
      setFieldSurname(parsed.surname.toLocaleUpperCase("fr"));
      newKeys.add("name");
    }
    if (parsed.occupation) {
      setFieldOccupation(parsed.occupation);
      newKeys.add("occupation");
    }

    // Naissance du sujet / Époux 1
    const bDate = parsed.birth_date_raw || (actKind === "birth" ? evDate : "");
    const bPlace = parsed.birth_place || (actKind === "birth" ? evPlace : "");
    if (bDate) {
      setFieldBirthDate(bDate);
      newKeys.add("birth_date");
    }
    if (bPlace) {
      setFieldBirthPlace(bPlace);
      newKeys.add("birth_place");
    }

    // Décès du sujet (ou mention marginale de décès)
    const dDate = parsed.death_date_raw || parsed.marginal_death_date || (actKind === "death" ? evDate : "");
    const dPlace = parsed.death_place || parsed.marginal_death_place || (actKind === "death" ? evPlace : "");
    if (dDate) {
      setFieldDeathDate(dDate);
      newKeys.add("death_date");
    }
    if (dPlace) {
      setFieldDeathPlace(dPlace);
      newKeys.add("death_place");
    }

    // Père (du sujet ou de l'époux 1)
    const fSurname = parsed.father_surname ? parsed.father_surname.toLocaleUpperCase("fr") : "";
    const fName = parsed.father_given_names || fSurname
      ? `${parsed.father_given_names || ""} ${fSurname}`.trim()
      : "";
    if (fName) {
      setFieldFather(fName);
      setCreateFather(true);
      newKeys.add("father");
    }
    if (parsed.father_occupation) {
      setFieldFatherOccupation(parsed.father_occupation);
      newKeys.add("father_occupation");
    }
    if (parsed.father_is_deceased !== undefined) {
      setFatherIsDeceased(Boolean(parsed.father_is_deceased));
      newKeys.add("father_status");
    }
    if (parsed.father_death_date_raw) {
      setFieldFatherDeathDate(parsed.father_death_date_raw);
      newKeys.add("father_death_date");
    }
    if (parsed.father_death_place) {
      setFieldFatherDeathPlace(parsed.father_death_place);
      newKeys.add("father_death_place");
    }
    if (parsed.father_birth_date_raw) {
      setFieldFatherBirthDate(parsed.father_birth_date_raw);
      newKeys.add("father_birth_date");
    }
    if (parsed.father_birth_place) {
      setFieldFatherBirthPlace(parsed.father_birth_place);
      newKeys.add("father_birth_place");
    }
    if (parsed.father_death_date_raw || parsed.father_death_place) {
      setFatherIsDeceased(true);
      newKeys.add("father_status");
    }

    // Mère (du sujet ou de l'époux 1)
    const mSurname = parsed.mother_surname ? parsed.mother_surname.toLocaleUpperCase("fr") : "";
    const mName = parsed.mother_given_names || mSurname
      ? `${parsed.mother_given_names || ""} ${mSurname}`.trim()
      : "";
    if (mName) {
      setFieldMother(mName);
      setCreateMother(true);
      newKeys.add("mother");
    }
    if (parsed.mother_occupation) {
      setFieldMotherOccupation(parsed.mother_occupation);
      newKeys.add("mother_occupation");
    }
    if (parsed.mother_is_deceased !== undefined) {
      setMotherIsDeceased(Boolean(parsed.mother_is_deceased));
      newKeys.add("mother_status");
    }
    if (parsed.mother_death_date_raw) {
      setFieldMotherDeathDate(parsed.mother_death_date_raw);
      newKeys.add("mother_death_date");
    }
    if (parsed.mother_death_place) {
      setFieldMotherDeathPlace(parsed.mother_death_place);
      newKeys.add("mother_death_place");
    }
    if (parsed.mother_birth_date_raw) {
      setFieldMotherBirthDate(parsed.mother_birth_date_raw);
      newKeys.add("mother_birth_date");
    }
    if (parsed.mother_birth_place) {
      setFieldMotherBirthPlace(parsed.mother_birth_place);
      newKeys.add("mother_birth_place");
    }
    if (parsed.mother_death_date_raw || parsed.mother_death_place) {
      setMotherIsDeceased(true);
      newKeys.add("mother_status");
    }

    // Conjoint & Mariage (Partenaire 2)
    const spSurname = (parsed.spouse_surname || parsed.bride?.surname || "").toLocaleUpperCase("fr");
    const spGiven = parsed.spouse_given_names || parsed.bride?.given_names || "";
    const spName = spGiven || spSurname
      ? `${spGiven} ${spSurname}`.trim()
      : (parsed.marginal_marriage_spouse || "");
    const mDate = parsed.marriage_date_raw || parsed.marginal_marriage_date || (actKind === "marriage" ? evDate : "");
    const mPlace = parsed.marriage_place || parsed.marginal_marriage_place || (actKind === "marriage" ? evPlace : "");
    if (spName) {
      setFieldSpouse(spName);
      newKeys.add("spouse");
    }
    const spOcc = parsed.spouse_occupation || parsed.bride?.occupation || "";
    if (spOcc) {
      setFieldSpouseOccupation(spOcc);
      newKeys.add("spouse_occupation");
    }
    const spBDate = parsed.spouse_birth_date_raw || parsed.bride?.birth_date_raw || "";
    if (spBDate) {
      setFieldSpouseBirthDate(spBDate);
      newKeys.add("spouse_birth_date");
    }
    const spBPlace = parsed.spouse_birth_place || parsed.bride?.birth_place || "";
    if (spBPlace) {
      setFieldSpouseBirthPlace(spBPlace);
      newKeys.add("spouse_birth_place");
    }
    if (mDate) {
      setFieldMarriageDate(mDate);
      newKeys.add("marriage_date");
    }
    if (mPlace) {
      setFieldMarriagePlace(mPlace);
      newKeys.add("marriage_place");
    }
    if (spName || mDate || mPlace) setCreateUnion(true);

    // Parents de l'épouse / Conjoint (Partenaire 2)
    const spFSurname = (parsed.spouse_father_surname || parsed.bride?.father_surname || "").toLocaleUpperCase("fr");
    const spFGiven = parsed.spouse_father_given_names || parsed.bride?.father_given_names || "";
    const spFName = spFGiven || spFSurname ? `${spFGiven} ${spFSurname}`.trim() : "";
    if (spFName) {
      setFieldSpouseFather(spFName);
      newKeys.add("spouse_father");
    }
    const spFOcc = parsed.spouse_father_occupation || parsed.bride?.father_occupation || "";
    if (spFOcc) {
      setFieldSpouseFatherOccupation(spFOcc);
      newKeys.add("spouse_father_occupation");
    }
    if (parsed.spouse_father_is_deceased !== undefined || parsed.bride?.father_is_deceased !== undefined) {
      const dec = Boolean(parsed.spouse_father_is_deceased ?? parsed.bride?.father_is_deceased);
      setSpouseFatherIsDeceased(dec);
      newKeys.add("spouse_father_status");
    }

    const spMSurname = (parsed.spouse_mother_surname || parsed.bride?.mother_surname || "").toLocaleUpperCase("fr");
    const spMGiven = parsed.spouse_mother_given_names || parsed.bride?.mother_given_names || "";
    const spMName = spMGiven || spMSurname ? `${spMGiven} ${spMSurname}`.trim() : "";
    if (spMName) {
      setFieldSpouseMother(spMName);
      newKeys.add("spouse_mother");
    }
    const spMOcc = parsed.spouse_mother_occupation || parsed.bride?.mother_occupation || "";
    if (spMOcc) {
      setFieldSpouseMotherOccupation(spMOcc);
      newKeys.add("spouse_mother_occupation");
    }
    if (parsed.spouse_mother_is_deceased !== undefined || parsed.bride?.mother_is_deceased !== undefined) {
      const dec = Boolean(parsed.spouse_mother_is_deceased ?? parsed.bride?.mother_is_deceased);
      setSpouseMotherIsDeceased(dec);
      newKeys.add("spouse_mother_status");
    }

    setSelectedFieldKeys(newKeys);
  }, [actKind]);

  // Récupérer la source correspondant à un champ
  const getSourceForField = useCallback((key: string): FieldSource | undefined => {
    if (!extractedData?.sources) return undefined;
    const s = extractedData.sources;
    switch (key) {
      case "date":
      case "event_date":
      case "birth_date":
      case "marriage_date":
      case "death_date":
        return s["event_date"] || s["date"] || s[key];
      case "place":
      case "event_place":
      case "birth_place":
      case "marriage_place":
      case "death_place":
        return s["event_place"] || s["place"] || s[key];
      case "name":
      case "given_names":
      case "surname":
        return s["given_names"] || s["person_name"] || s["groom"] || s["groom_name"] || s["subject"];
      case "occupation":
        return s["occupation"] || s["groom_occupation"];
      case "father":
      case "father_status":
      case "father_death_date":
      case "father_death_place":
        return s["father"] || s["father_name"] || s["groom_father"];
      case "mother":
      case "mother_status":
      case "mother_death_date":
      case "mother_death_place":
        return s["mother"] || s["mother_name"] || s["groom_mother"];
      case "spouse":
        return s["spouse"] || s["bride"] || s["bride_name"] || s["marginal_marriage_spouse"];
      case "spouse_father":
      case "spouse_father_status":
        return s["spouse_father"] || s["bride_father"];
      case "spouse_mother":
      case "spouse_mother_status":
        return s["spouse_mother"] || s["bride_mother"];
      default:
        return s[key];
    }
  }, [extractedData]);

  const handleRowHover = useCallback((fieldKey: string) => {
    const src = getSourceForField(fieldKey);
    setHoveredSourceKey(fieldKey);
    if (src?.box) {
      setHoveredSourceBox(src.box);
    } else {
      setHoveredSourceBox(null);
    }
  }, [getSourceForField]);

  const handleRowLeave = useCallback(() => {
    setHoveredSourceKey(null);
    setHoveredSourceBox(null);
  }, []);

  const toggleFieldKey = (key: string) => {
    setSelectedFieldKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectAllKeys = (keys: string[]) => {
    setSelectedFieldKeys(new Set(keys));
  };

  const deselectAllKeys = () => {
    setSelectedFieldKeys(new Set());
  };

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
          actKind,
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
      if (selectedFieldKeys.has("date") && fieldDate.trim()) fd.append("date_raw", fieldDate.trim());
      if (selectedFieldKeys.has("place") && fieldPlace.trim()) fd.append("place", fieldPlace.trim());

      // Sujet / Époux 1
      if (selectedFieldKeys.has("name")) {
        if (fieldGivenNames.trim()) fd.append("given_names", fieldGivenNames.trim());
        if (fieldSurname.trim()) fd.append("surname", fieldSurname.trim().toLocaleUpperCase("fr"));
      }
      if (selectedFieldKeys.has("occupation") && fieldOccupation.trim()) fd.append("occupation", fieldOccupation.trim());
      if (selectedFieldKeys.has("birth_date") && fieldBirthDate.trim()) fd.append("birth_date_raw", fieldBirthDate.trim());
      if (selectedFieldKeys.has("birth_place") && fieldBirthPlace.trim()) fd.append("birth_place", fieldBirthPlace.trim());
      if (selectedFieldKeys.has("death_date") && fieldDeathDate.trim()) fd.append("death_date_raw", fieldDeathDate.trim());
      if (selectedFieldKeys.has("death_place") && fieldDeathPlace.trim()) fd.append("death_place", fieldDeathPlace.trim());

      // Père (du sujet ou époux 1)
      if (selectedFieldKeys.has("father") && fieldFather.trim()) {
        const fParts = splitFullName(fieldFather.trim());
        fd.append("father_given_names", fParts.given_names);
        fd.append("father_surname", fParts.surname);
        fd.append("create_father", createFather ? "1" : "0");
      }
      if (selectedFieldKeys.has("father_occupation") && fieldFatherOccupation.trim()) fd.append("father_occupation", fieldFatherOccupation.trim());
      if (selectedFieldKeys.has("father_status") && fatherIsDeceased) fd.append("father_is_deceased", "1");
      if (selectedFieldKeys.has("father_death_date") && fieldFatherDeathDate.trim()) fd.append("father_death_date_raw", fieldFatherDeathDate.trim());
      if (selectedFieldKeys.has("father_death_place") && fieldFatherDeathPlace.trim()) fd.append("father_death_place", fieldFatherDeathPlace.trim());
      if (selectedFieldKeys.has("father_birth_date") && fieldFatherBirthDate.trim()) fd.append("father_birth_date_raw", fieldFatherBirthDate.trim());
      if (selectedFieldKeys.has("father_birth_place") && fieldFatherBirthPlace.trim()) fd.append("father_birth_place", fieldFatherBirthPlace.trim());

      // Mère (du sujet ou époux 1)
      if (selectedFieldKeys.has("mother") && fieldMother.trim()) {
        const mParts = splitFullName(fieldMother.trim());
        fd.append("mother_given_names", mParts.given_names);
        fd.append("mother_surname", mParts.surname);
        fd.append("create_mother", createMother ? "1" : "0");
      }
      if (selectedFieldKeys.has("mother_occupation") && fieldMotherOccupation.trim()) fd.append("mother_occupation", fieldMotherOccupation.trim());
      if (selectedFieldKeys.has("mother_status") && motherIsDeceased) fd.append("mother_is_deceased", "1");
      if (selectedFieldKeys.has("mother_death_date") && fieldMotherDeathDate.trim()) fd.append("mother_death_date_raw", fieldMotherDeathDate.trim());
      if (selectedFieldKeys.has("mother_death_place") && fieldMotherDeathPlace.trim()) fd.append("mother_death_place", fieldMotherDeathPlace.trim());
      if (selectedFieldKeys.has("mother_birth_date") && fieldMotherBirthDate.trim()) fd.append("mother_birth_date_raw", fieldMotherBirthDate.trim());
      if (selectedFieldKeys.has("mother_birth_place") && fieldMotherBirthPlace.trim()) fd.append("mother_birth_place", fieldMotherBirthPlace.trim());

      // Conjoint & Mariage (Partenaire 2)
      if (selectedFieldKeys.has("spouse") && fieldSpouse.trim()) {
        const sParts = splitFullName(fieldSpouse.trim());
        fd.append("spouse_given_names", sParts.given_names);
        fd.append("spouse_surname", sParts.surname);
      }
      if (selectedFieldKeys.has("spouse_occupation") && fieldSpouseOccupation.trim()) fd.append("spouse_occupation", fieldSpouseOccupation.trim());
      if (selectedFieldKeys.has("spouse_birth_date") && fieldSpouseBirthDate.trim()) fd.append("spouse_birth_date_raw", fieldSpouseBirthDate.trim());
      if (selectedFieldKeys.has("spouse_birth_place") && fieldSpouseBirthPlace.trim()) fd.append("spouse_birth_place", fieldSpouseBirthPlace.trim());

      // Parents de l'épouse / Conjoint (Partenaire 2)
      if (selectedFieldKeys.has("spouse_father") && fieldSpouseFather.trim()) {
        const sfParts = splitFullName(fieldSpouseFather.trim());
        fd.append("spouse_father_given_names", sfParts.given_names);
        fd.append("spouse_father_surname", sfParts.surname);
      }
      if (selectedFieldKeys.has("spouse_father_occupation") && fieldSpouseFatherOccupation.trim()) fd.append("spouse_father_occupation", fieldSpouseFatherOccupation.trim());
      if (selectedFieldKeys.has("spouse_father_status") && spouseFatherIsDeceased) fd.append("spouse_father_is_deceased", "1");

      if (selectedFieldKeys.has("spouse_mother") && fieldSpouseMother.trim()) {
        const smParts = splitFullName(fieldSpouseMother.trim());
        fd.append("spouse_mother_given_names", smParts.given_names);
        fd.append("spouse_mother_surname", smParts.surname);
      }
      if (selectedFieldKeys.has("spouse_mother_occupation") && fieldSpouseMotherOccupation.trim()) fd.append("spouse_mother_occupation", fieldSpouseMotherOccupation.trim());
      if (selectedFieldKeys.has("spouse_mother_status") && spouseMotherIsDeceased) fd.append("spouse_mother_is_deceased", "1");

      if (selectedFieldKeys.has("marriage_date") && fieldMarriageDate.trim()) fd.append("marriage_date_raw", fieldMarriageDate.trim());
      if (selectedFieldKeys.has("marriage_place") && fieldMarriagePlace.trim()) fd.append("marriage_place", fieldMarriagePlace.trim());
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

  let screenSourceBox: { left: number; top: number; width: number; height: number } | null = null;
  if (hoveredSourceBox && naturalSize.width > 0 && naturalSize.height > 0) {
    const x1 = (hoveredSourceBox.xmin / 1000) * naturalSize.width;
    const y1 = (hoveredSourceBox.ymin / 1000) * naturalSize.height;
    const x2 = (hoveredSourceBox.xmax / 1000) * naturalSize.width;
    const y2 = (hoveredSourceBox.ymax / 1000) * naturalSize.height;
    const pt1 = imageToScreen(x1, y1);
    const pt2 = imageToScreen(x2, y2);
    screenSourceBox = {
      left: Math.min(pt1.x, pt2.x),
      top: Math.min(pt1.y, pt2.y),
      width: Math.max(Math.abs(pt2.x - pt1.x), 12),
      height: Math.max(Math.abs(pt2.y - pt1.y), 12),
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

          {/* Boîte animée de mise en évidence de la source (survol) */}
          {screenSourceBox && (
            <div
              style={{
                left: screenSourceBox.left,
                top: screenSourceBox.top,
                width: screenSourceBox.width,
                height: screenSourceBox.height,
              }}
              className="absolute pointer-events-none border-2 border-amber-400 bg-amber-400/25 shadow-xl z-20 rounded transition-all duration-150 animate-pulse ring-4 ring-amber-400/30"
            >
              <span className="absolute -top-6 left-0 rounded bg-amber-500 text-slate-950 font-bold px-1.5 py-0.5 text-[10px] tracking-wide shadow-md uppercase">
                Source dans l'acte
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
          <aside className="w-[640px] max-w-[95vw] lg:w-[700px] border-l border-border bg-surface flex flex-col shrink-0 z-20 shadow-2xl animate-in slide-in-from-right duration-200">
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

                  {/* Indicateur de source survolée */}
                  {hoveredSourceKey && getSourceForField(hoveredSourceKey)?.text && (
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-400/10 border border-amber-400/30 text-amber-900 dark:text-amber-200 rounded-lg text-xs animate-in fade-in duration-150">
                      <span className="font-semibold shrink-0">🔎 Extrait identifié :</span>
                      <span className="italic truncate font-serif">« {getSourceForField(hoveredSourceKey)!.text} »</span>
                    </div>
                  )}

                  {editMode ? (
                    <textarea
                      rows={14}
                      value={transcription}
                      onChange={(e) => setTranscription(e.target.value)}
                      placeholder="La transcription s'affiche ici…"
                      className="field w-full rounded-lg p-2.5 text-xs font-mono leading-relaxed resize-none flex-1 min-h-[220px]"
                    />
                  ) : (() => {
                    const activeQuote = hoveredSourceKey ? getSourceForField(hoveredSourceKey)?.text?.trim() : undefined;
                    if (activeQuote && transcription.toLowerCase().includes(activeQuote.toLowerCase())) {
                      const idx = transcription.toLowerCase().indexOf(activeQuote.toLowerCase());
                      const before = transcription.slice(0, idx);
                      const match = transcription.slice(idx, idx + activeQuote.length);
                      const after = transcription.slice(idx + activeQuote.length);
                      return (
                        <div className="overflow-y-auto max-h-[360px] p-2.5 bg-surface-2/40 rounded-lg border border-border/60 text-xs text-fg leading-relaxed whitespace-pre-wrap font-sans">
                          <span>{before}</span>
                          <mark className="bg-amber-300 dark:bg-amber-500/40 text-amber-950 dark:text-amber-100 px-1 py-0.5 rounded font-semibold ring-2 ring-amber-400 animate-pulse shadow-xs">
                            {match}
                          </mark>
                          <span>{after}</span>
                        </div>
                      );
                    }
                    return (
                      <div className="overflow-y-auto max-h-[360px] p-2 bg-surface-2/40 rounded-lg border border-border/60 text-xs text-fg leading-relaxed">
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
                    );
                  })()}

                  <p className="text-[10px] text-fg-subtle">
                    {editMode
                      ? "Vous éditez le texte source. Cliquez sur « Aperçu formaté » pour revoir le rendu."
                      : "Cliquez sur « ✎ Modifier texte » pour ajuster des mots ou corriger la transcription."}
                  </p>

                  {/* Synthèse des données extraites avec vue comparative Avant / Après */}
                  {slug && (personId || unionId) && (() => {
                    const isMarriage = actKind === "marriage" || Boolean(unionId);
                    const allAvailableKeys = isMarriage
                      ? [
                          "marriage_date",
                          "marriage_place",
                          "name",
                          "occupation",
                          "birth_date",
                          "birth_place",
                          "father",
                          "father_status",
                          "mother",
                          "mother_status",
                          "spouse",
                          "spouse_occupation",
                          "spouse_birth_date",
                          "spouse_birth_place",
                          "spouse_father",
                          "spouse_father_status",
                          "spouse_mother",
                          "spouse_mother_status",
                        ]
                      : [
                          "date",
                          "place",
                          "name",
                          "occupation",
                          "birth_date",
                          "birth_place",
                          "death_date",
                          "death_place",
                          "father",
                          "father_occupation",
                          "father_status",
                          "father_death_date",
                          "father_death_place",
                          "mother",
                          "mother_occupation",
                          "mother_status",
                          "mother_death_date",
                          "mother_death_place",
                          "spouse",
                          "marriage_date",
                          "marriage_place",
                        ];

                    const renderRow = (
                      key: string,
                      label: string,
                      currentVal: string | null | undefined,
                      proposedVal: string,
                      onChangeProposed: (v: string) => void,
                      icon?: string,
                      placeholder?: string
                    ) => {
                      const isChecked = selectedFieldKeys.has(key);
                      const src = getSourceForField(key);
                      const isDiff = proposedVal.trim() !== (currentVal || "").trim();
                      const isEmptyProposed = !proposedVal.trim();

                      return (
                        <div
                          key={key}
                          onMouseEnter={() => handleRowHover(key)}
                          onMouseLeave={handleRowLeave}
                          className={`group flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-xl border p-2 transition-all ${
                            isChecked
                              ? "border-border bg-surface shadow-2xs"
                              : "border-border/40 bg-surface-2/20 opacity-70 hover:opacity-100"
                          }`}
                        >
                          {/* 1. Checkbox & Libellé */}
                          <div className="flex items-center gap-2 min-w-[145px] shrink-0">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => toggleFieldKey(key)}
                              disabled={isEmptyProposed}
                              className="accent-fg rounded size-3.5 cursor-pointer"
                            />
                            <span className="font-medium text-fg flex items-center gap-1.5 text-xs truncate">
                              {icon && <span className="opacity-80 text-[13px]">{icon}</span>}
                              <span>{label}</span>
                            </span>
                          </div>

                          {/* 2. Actuel (Base de données) */}
                          <div className="flex-1 min-w-0 flex items-center gap-1 px-2 py-1 rounded-lg bg-surface-2/60 border border-border/50 text-fg-muted font-normal text-xs">
                            <span className="text-[10px] text-fg-subtle shrink-0">Actuel :</span>
                            <span className="truncate" title={currentVal || "Non renseigné"}>
                              {currentVal ? (
                                <span className="text-fg font-medium">{currentVal}</span>
                              ) : (
                                <span className="italic text-fg-subtle text-[11px]">— Non renseigné</span>
                              )}
                            </span>
                          </div>

                          <span className="hidden sm:inline text-fg-subtle text-[11px] shrink-0">→</span>

                          {/* 3. Proposé (Extrait de l'acte) */}
                          <div className="flex-1 min-w-0 flex items-center gap-1.5">
                            <input
                              type="text"
                              value={proposedVal}
                              onChange={(e) => onChangeProposed(e.target.value)}
                              placeholder={placeholder || "Non détecté"}
                              className={`field w-full text-xs font-medium py-1 px-2 ${
                                isDiff && !isEmptyProposed
                                  ? "border-ok/40 bg-ok/5 text-fg ring-ok/20 font-semibold"
                                  : "text-fg-muted"
                              }`}
                            />
                          </div>

                          {/* 4. Bouton Source interactive */}
                          {src && (src.text || src.box) && (
                            <button
                              type="button"
                              onClick={() => handleRowHover(key)}
                              className="shrink-0 flex items-center gap-1 rounded-md border border-amber-400/40 bg-amber-400/10 px-1.5 py-0.5 text-[10.5px] font-medium text-amber-700 dark:text-amber-300 hover:bg-amber-400/25 transition-colors cursor-pointer"
                              title={src.text ? `Extrait : « ${src.text} »` : "Localisation sur l'acte"}
                            >
                              <span>🔎</span>
                              <span className="hidden md:inline">Source</span>
                            </button>
                          )}
                        </div>
                      );
                    };

                    const renderStatusRow = (
                      key: string,
                      label: string,
                      currentDeceased: boolean | undefined,
                      proposedDeceased: boolean,
                      onToggleDeceased: (val: boolean) => void,
                      icon?: string
                    ) => {
                      const isChecked = selectedFieldKeys.has(key);
                      const src = getSourceForField(key);

                      return (
                        <div
                          key={key}
                          onMouseEnter={() => handleRowHover(key)}
                          onMouseLeave={handleRowLeave}
                          className={`group flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-xl border p-2 transition-all ${
                            isChecked
                              ? "border-border bg-surface shadow-2xs"
                              : "border-border/40 bg-surface-2/20 opacity-70 hover:opacity-100"
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-[145px] shrink-0">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => toggleFieldKey(key)}
                              className="accent-fg rounded size-3.5 cursor-pointer"
                            />
                            <span className="font-medium text-fg flex items-center gap-1.5 text-xs truncate">
                              {icon && <span className="opacity-80 text-[13px]">{icon}</span>}
                              <span>{label}</span>
                            </span>
                          </div>

                          <div className="flex-1 min-w-0 flex items-center gap-1 px-2 py-1 rounded-lg bg-surface-2/60 border border-border/50 text-fg-muted font-normal text-xs">
                            <span className="text-[10px] text-fg-subtle shrink-0">Actuel :</span>
                            <span className="truncate">
                              {currentDeceased ? (
                                <span className="text-danger font-medium">✝ Défunt(e)</span>
                              ) : (
                                <span className="text-ok font-medium">Vivant(e) / Non précisé</span>
                              )}
                            </span>
                          </div>

                          <span className="hidden sm:inline text-fg-subtle text-[11px] shrink-0">→</span>

                          <div className="flex-1 min-w-0 flex items-center gap-2">
                            <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none">
                              <input
                                type="checkbox"
                                checked={proposedDeceased}
                                onChange={(e) => onToggleDeceased(e.target.checked)}
                                className="accent-fg rounded"
                              />
                              <span className={proposedDeceased ? "font-semibold text-danger" : "text-fg-muted"}>
                                {proposedDeceased ? "✝ Feu / Défunt au moment de l'acte" : "Vivant au moment de l'acte"}
                              </span>
                            </label>
                          </div>

                          {src && (src.text || src.box) && (
                            <button
                              type="button"
                              onClick={() => handleRowHover(key)}
                              className="shrink-0 flex items-center gap-1 rounded-md border border-amber-400/40 bg-amber-400/10 px-1.5 py-0.5 text-[10.5px] font-medium text-amber-700 dark:text-amber-300 hover:bg-amber-400/25 transition-colors cursor-pointer"
                              title={src.text ? `Extrait : « ${src.text} »` : "Localisation sur l'acte"}
                            >
                              <span>🔎</span>
                              <span className="hidden md:inline">Source</span>
                            </button>
                          )}
                        </div>
                      );
                    };

                    return (
                      <div className="mt-2 flex flex-col gap-3 rounded-2xl border border-border bg-surface-2/40 p-3.5 shadow-xs">
                        {/* Barre supérieure d'actions */}
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/80 pb-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-base">⚖️</span>
                              <h4 className="font-semibold text-fg text-sm">
                                Comparaison Avant / Après
                              </h4>
                              <span className="rounded-full bg-surface px-2 py-0.5 text-[10.5px] font-medium text-fg-muted border border-border">
                                {selectedFieldKeys.size} validé{selectedFieldKeys.size > 1 ? "s" : ""}
                              </span>
                            </div>
                            <p className="mt-0.5 text-[11px] text-fg-muted">
                              Cochez les données à enregistrer. Survolez une ligne pour voir sa source dans l'acte.
                            </p>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => selectAllKeys(allAvailableKeys)}
                              className="rounded-lg border border-border bg-surface px-2 py-1 text-[11px] font-medium text-fg hover:bg-surface-2 transition-colors cursor-pointer"
                            >
                              ✓ Tout cocher
                            </button>
                            <button
                              type="button"
                              onClick={deselectAllKeys}
                              className="rounded-lg border border-border bg-surface px-2 py-1 text-[11px] text-fg-subtle hover:text-fg hover:bg-surface-2 transition-colors cursor-pointer"
                            >
                              ✕ Décocher
                            </button>
                            <button
                              type="button"
                              onClick={handleSyncFromTranscription}
                              className="rounded-lg border border-border bg-surface px-2 py-1 text-[11px] text-fg-subtle hover:text-fg hover:bg-surface-2 transition-colors cursor-pointer"
                              title="Ré-analyser la transcription"
                            >
                              🔄 Ré-analyser
                            </button>
                          </div>
                        </div>

                        {/* Listes groupées par profil selon le type d'acte */}
                        <div className="flex flex-col gap-3.5">
                          {isMarriage ? (
                            <>
                              {/* 1. Mariage (Événement) */}
                              <div className="flex flex-col gap-1.5">
                                <span className="text-[11.5px] font-semibold text-fg flex items-center gap-1.5 px-0.5">
                                  <span>💍</span>
                                  <span>Événement du mariage</span>
                                </span>
                                {renderRow(
                                  "marriage_date",
                                  "Date du mariage",
                                  currentContext?.union?.date_raw,
                                  fieldMarriageDate,
                                  setFieldMarriageDate,
                                  "📅"
                                )}
                                {renderRow(
                                  "marriage_place",
                                  "Lieu du mariage",
                                  currentContext?.union?.place,
                                  fieldMarriagePlace,
                                  setFieldMarriagePlace,
                                  "📍"
                                )}
                              </div>

                              {/* 2. Époux (Partenaire 1) */}
                              <div className="flex flex-col gap-1.5">
                                <span className="text-[11.5px] font-semibold text-fg flex items-center gap-1.5 px-0.5">
                                  <span>🤵</span>
                                  <span>Époux (Partenaire 1)</span>
                                </span>
                                {renderRow(
                                  "name",
                                  "Prénom(s) & Nom",
                                  currentContext?.union?.partner1?.displayName || currentContext?.person?.displayName,
                                  `${fieldGivenNames} ${fieldSurname}`.trim(),
                                  (val) => {
                                    const p = splitFullName(val);
                                    setFieldGivenNames(p.given_names);
                                    setFieldSurname(p.surname);
                                  },
                                  "👤"
                                )}
                                {renderRow(
                                  "occupation",
                                  "Métier époux",
                                  currentContext?.union?.partner1?.occupation || currentContext?.person?.occupation,
                                  fieldOccupation,
                                  setFieldOccupation,
                                  "💼"
                                )}
                                {renderRow(
                                  "birth_date",
                                  "Date naiss. époux",
                                  currentContext?.union?.partner1?.birth_date_raw || currentContext?.person?.birth_date_raw,
                                  fieldBirthDate,
                                  setFieldBirthDate,
                                  "👶"
                                )}
                                {renderRow(
                                  "birth_place",
                                  "Lieu naiss. époux",
                                  currentContext?.union?.partner1?.birth_place || currentContext?.person?.birth_place,
                                  fieldBirthPlace,
                                  setFieldBirthPlace,
                                  "📍"
                                )}
                              </div>

                              {/* 3. Parents de l'Époux */}
                              <div className="flex flex-col gap-1.5">
                                <span className="text-[11.5px] font-semibold text-fg flex items-center gap-1.5 px-0.5">
                                  <span>👨‍👩‍👦</span>
                                  <span>Parents de l'Époux</span>
                                </span>
                                {renderRow(
                                  "father",
                                  "Père de l'époux",
                                  currentContext?.union?.partner1Father?.displayName || currentContext?.person?.father?.displayName,
                                  fieldFather,
                                  setFieldFather,
                                  "👨"
                                )}
                                {renderStatusRow(
                                  "father_status",
                                  "Statut père époux",
                                  currentContext?.union?.partner1Father?.is_living === 0 || currentContext?.person?.father?.is_living === 0,
                                  fatherIsDeceased,
                                  setFatherIsDeceased,
                                  "✝"
                                )}
                                {renderRow(
                                  "mother",
                                  "Mère de l'époux",
                                  currentContext?.union?.partner1Mother?.displayName || currentContext?.person?.mother?.displayName,
                                  fieldMother,
                                  setFieldMother,
                                  "👩"
                                )}
                                {renderStatusRow(
                                  "mother_status",
                                  "Statut mère époux",
                                  currentContext?.union?.partner1Mother?.is_living === 0 || currentContext?.person?.mother?.is_living === 0,
                                  motherIsDeceased,
                                  setMotherIsDeceased,
                                  "✝"
                                )}
                              </div>

                              {/* 4. Épouse (Partenaire 2) */}
                              <div className="flex flex-col gap-1.5">
                                <span className="text-[11.5px] font-semibold text-fg flex items-center gap-1.5 px-0.5">
                                  <span>👰</span>
                                  <span>Épouse (Partenaire 2)</span>
                                </span>
                                {renderRow(
                                  "spouse",
                                  "Prénom(s) & Nom",
                                  currentContext?.union?.partner2?.displayName,
                                  fieldSpouse,
                                  setFieldSpouse,
                                  "👤"
                                )}
                                {renderRow(
                                  "spouse_occupation",
                                  "Métier épouse",
                                  currentContext?.union?.partner2?.occupation,
                                  fieldSpouseOccupation,
                                  setFieldSpouseOccupation,
                                  "💼"
                                )}
                                {renderRow(
                                  "spouse_birth_date",
                                  "Date naiss. épouse",
                                  currentContext?.union?.partner2?.birth_date_raw,
                                  fieldSpouseBirthDate,
                                  setFieldSpouseBirthDate,
                                  "👶"
                                )}
                                {renderRow(
                                  "spouse_birth_place",
                                  "Lieu naiss. épouse",
                                  currentContext?.union?.partner2?.birth_place,
                                  fieldSpouseBirthPlace,
                                  setFieldSpouseBirthPlace,
                                  "📍"
                                )}
                              </div>

                              {/* 5. Parents de l'Épouse */}
                              <div className="flex flex-col gap-1.5">
                                <span className="text-[11.5px] font-semibold text-fg flex items-center gap-1.5 px-0.5">
                                  <span>👨‍👩‍👧</span>
                                  <span>Parents de l'Épouse</span>
                                </span>
                                {renderRow(
                                  "spouse_father",
                                  "Père de l'épouse",
                                  currentContext?.union?.partner2Father?.displayName,
                                  fieldSpouseFather,
                                  setFieldSpouseFather,
                                  "👨"
                                )}
                                {renderStatusRow(
                                  "spouse_father_status",
                                  "Statut père épouse",
                                  currentContext?.union?.partner2Father?.is_living === 0,
                                  spouseFatherIsDeceased,
                                  setSpouseFatherIsDeceased,
                                  "✝"
                                )}
                                {renderRow(
                                  "spouse_mother",
                                  "Mère de l'épouse",
                                  currentContext?.union?.partner2Mother?.displayName,
                                  fieldSpouseMother,
                                  setFieldSpouseMother,
                                  "👩"
                                )}
                                {renderStatusRow(
                                  "spouse_mother_status",
                                  "Statut mère épouse",
                                  currentContext?.union?.partner2Mother?.is_living === 0,
                                  spouseMotherIsDeceased,
                                  setSpouseMotherIsDeceased,
                                  "✝"
                                )}
                              </div>
                            </>
                          ) : (
                            <>
                              {/* 1. Événement / Acte */}
                              <div className="flex flex-col gap-1.5">
                                <span className="text-[11.5px] font-semibold text-fg flex items-center gap-1.5 px-0.5">
                                  <span>📜</span>
                                  <span>
                                    {actKind === "death" ? "Acte de décès" : "Acte de baptême / naissance"}
                                  </span>
                                </span>
                                {renderRow(
                                  "date",
                                  "Date de l'acte",
                                  actKind === "death" ? currentContext?.person?.death_date_raw : currentContext?.person?.birth_date_raw,
                                  fieldDate,
                                  setFieldDate,
                                  "📅"
                                )}
                                {renderRow(
                                  "place",
                                  "Lieu / Paroisse",
                                  actKind === "death" ? currentContext?.person?.death_place : currentContext?.person?.birth_place,
                                  fieldPlace,
                                  setFieldPlace,
                                  "📍"
                                )}
                              </div>

                              {/* 2. Individu concerné */}
                              <div className="flex flex-col gap-1.5">
                                <span className="text-[11.5px] font-semibold text-fg flex items-center gap-1.5 px-0.5">
                                  <span>👤</span>
                                  <span>Individu concerné</span>
                                </span>
                                {renderRow(
                                  "name",
                                  "Prénom(s) & Nom",
                                  currentContext?.person?.displayName,
                                  `${fieldGivenNames} ${fieldSurname}`.trim(),
                                  (val) => {
                                    const p = splitFullName(val);
                                    setFieldGivenNames(p.given_names);
                                    setFieldSurname(p.surname);
                                  },
                                  "👤"
                                )}
                                {renderRow(
                                  "occupation",
                                  "Profession / Métier",
                                  currentContext?.person?.occupation,
                                  fieldOccupation,
                                  setFieldOccupation,
                                  "💼"
                                )}
                                {(actKind === "death" || fieldBirthDate || fieldBirthPlace) && (
                                  <>
                                    {renderRow(
                                      "birth_date",
                                      "Date naissance déduite",
                                      currentContext?.person?.birth_date_raw,
                                      fieldBirthDate,
                                      setFieldBirthDate,
                                      "👶"
                                    )}
                                    {renderRow(
                                      "birth_place",
                                      "Lieu de naissance",
                                      currentContext?.person?.birth_place,
                                      fieldBirthPlace,
                                      setFieldBirthPlace,
                                      "📍"
                                    )}
                                  </>
                                )}
                                {(actKind === "birth" && (fieldDeathDate || fieldDeathPlace)) && (
                                  <>
                                    {renderRow(
                                      "death_date",
                                      "Mention décès marginale",
                                      currentContext?.person?.death_date_raw,
                                      fieldDeathDate,
                                      setFieldDeathDate,
                                      "✝"
                                    )}
                                    {renderRow(
                                      "death_place",
                                      "Lieu de décès marginal",
                                      currentContext?.person?.death_place,
                                      fieldDeathPlace,
                                      setFieldDeathPlace,
                                      "📍"
                                    )}
                                  </>
                                )}
                              </div>

                              {/* 3. Parents */}
                              <div className="flex flex-col gap-1.5">
                                <span className="text-[11.5px] font-semibold text-fg flex items-center gap-1.5 px-0.5">
                                  <span>👨‍👩‍👦</span>
                                  <span>Filiation (Parents)</span>
                                </span>
                                {renderRow(
                                  "father",
                                  "Père",
                                  currentContext?.person?.father?.displayName,
                                  fieldFather,
                                  setFieldFather,
                                  "👨"
                                )}
                                {fieldFatherOccupation && renderRow(
                                  "father_occupation",
                                  "Métier du père",
                                  null,
                                  fieldFatherOccupation,
                                  setFieldFatherOccupation,
                                  "💼"
                                )}
                                {renderStatusRow(
                                  "father_status",
                                  "Statut père",
                                  currentContext?.person?.father?.is_living === 0,
                                  fatherIsDeceased,
                                  setFatherIsDeceased,
                                  "✝"
                                )}
                                {fieldFatherDeathDate && renderRow(
                                  "father_death_date",
                                  "Date décès père",
                                  null,
                                  fieldFatherDeathDate,
                                  setFieldFatherDeathDate,
                                  "📅"
                                )}
                                {renderRow(
                                  "mother",
                                  "Mère",
                                  currentContext?.person?.mother?.displayName,
                                  fieldMother,
                                  setFieldMother,
                                  "👩"
                                )}
                                {fieldMotherOccupation && renderRow(
                                  "mother_occupation",
                                  "Métier de la mère",
                                  null,
                                  fieldMotherOccupation,
                                  setFieldMotherOccupation,
                                  "💼"
                                )}
                                {renderStatusRow(
                                  "mother_status",
                                  "Statut mère",
                                  currentContext?.person?.mother?.is_living === 0,
                                  motherIsDeceased,
                                  setMotherIsDeceased,
                                  "✝"
                                )}
                                {fieldMotherDeathDate && renderRow(
                                  "mother_death_date",
                                  "Date décès mère",
                                  null,
                                  fieldMotherDeathDate,
                                  setFieldMotherDeathDate,
                                  "📅"
                                )}
                              </div>

                              {/* 4. Conjoint / Union éventuelle */}
                              {(fieldSpouse || fieldMarriageDate || fieldMarriagePlace) && (
                                <div className="flex flex-col gap-1.5">
                                  <span className="text-[11.5px] font-semibold text-fg flex items-center gap-1.5 px-0.5">
                                    <span>💍</span>
                                    <span>Conjoint / Union mentionnée</span>
                                  </span>
                                  {renderRow(
                                    "spouse",
                                    "Conjoint(e)",
                                    currentContext?.union?.partner2?.displayName,
                                    fieldSpouse,
                                    setFieldSpouse,
                                    "💍"
                                  )}
                                  {fieldMarriageDate && renderRow(
                                    "marriage_date",
                                    "Date mariage",
                                    currentContext?.union?.date_raw,
                                    fieldMarriageDate,
                                    setFieldMarriageDate,
                                    "📅"
                                  )}
                                  {fieldMarriagePlace && renderRow(
                                    "marriage_place",
                                    "Lieu mariage",
                                    currentContext?.union?.place,
                                    fieldMarriagePlace,
                                    setFieldMarriagePlace,
                                    "📍"
                                  )}
                                </div>
                              )}
                            </>
                          )}
                        </div>

                        {/* Note de transcription intégrale */}
                        <label className="mt-1 flex items-center gap-2 cursor-pointer text-[11px] text-fg select-none">
                          <input
                            type="checkbox"
                            checked={appendToNotes}
                            onChange={(e) => setAppendToNotes(e.target.checked)}
                            className="accent-fg rounded"
                          />
                          <span>Conserver également la transcription intégrale dans les notes</span>
                        </label>

                        {/* Messages de retour */}
                        {saveSuccessMessage && (
                          <div className="rounded-xl bg-ok/10 border border-ok/30 p-2.5 text-center text-xs font-medium text-ok animate-in fade-in">
                            {saveSuccessMessage}
                          </div>
                        )}
                        {saveErrorMessage && (
                          <div className="rounded-xl bg-danger/10 border border-danger/30 p-2.5 text-center text-xs font-medium text-danger animate-in fade-in">
                            ⚠️ {saveErrorMessage}
                          </div>
                        )}

                        {/* Bouton Enregistrer dans la fiche */}
                        <button
                          type="button"
                          onClick={handleSaveToRecord}
                          disabled={pendingSave || selectedFieldKeys.size === 0}
                          className="w-full mt-1 rounded-xl bg-fg py-2.5 px-3 text-xs font-semibold text-accent-fg hover:opacity-90 disabled:opacity-50 transition-opacity shadow-sm flex items-center justify-center gap-2 cursor-pointer"
                        >
                          {pendingSave ? (
                            <>
                              <span className="inline-block size-3 rounded-full border-2 border-accent-fg border-t-transparent animate-spin" />
                              <span>Enregistrement dans la fiche…</span>
                            </>
                          ) : (
                            <>
                              <span>💾</span>
                              <span>Valider et enregistrer ({selectedFieldKeys.size} champ{selectedFieldKeys.size > 1 ? "s" : ""})</span>
                            </>
                          )}
                        </button>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
