"use client";

import { useEffect, useRef, useState, useCallback, useTransition } from "react";
import { useRouter } from "next/navigation";
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
  const router = useRouter();
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

  // Navigation par onglets dans le panneau latéral
  const [sidebarTab, setSidebarTab] = useState<"compare" | "transcription" | "settings">("compare");
  // Filtre d'affichage de la comparaison : "changes" = uniquement nouveautés/modifs, "all" = tous les champs
  const [filterMode, setFilterMode] = useState<"changes" | "all">("changes");

  const [appendToNotes, setAppendToNotes] = useState(false);
  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string | null>(null);
  const [saveErrorMessage, setSaveErrorMessage] = useState<string | null>(null);

  // Contexte existant en base pour la comparaison Avant / Après
  const [currentContext, setCurrentContext] = useState<ActViewerContextData | null>(null);

  // État de la source épinglée (clic pour cibler et inspecter confortablement sans clignotement)
  const [pinnedSourceKey, setPinnedSourceKey] = useState<string | null>(null);
  const [ocrCropRef, setOcrCropRef] = useState<CropBox | null>(null);

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

    // De base tout décocher : l'utilisateur sélectionne ce qu'il souhaite ajouter
    setSelectedFieldKeys(new Set());
    setSidebarTab("compare");
    setFilterMode("changes");
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
      case "father_birth_date":
        return s["father_birth_date"] || s["father_age"] || s["father"];
      case "father_birth_place":
        return s["father_birth_place"] || s["father"];
      case "mother":
      case "mother_status":
      case "mother_death_date":
      case "mother_death_place":
        return s["mother"] || s["mother_name"] || s["groom_mother"];
      case "mother_birth_date":
        return s["mother_birth_date"] || s["mother_age"] || s["mother"];
      case "mother_birth_place":
        return s["mother_birth_place"] || s["mother"];
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

  const getFieldLabel = (key: string): string => {
    switch (key) {
      case "date": return "Date de l'acte";
      case "place": return "Lieu de l'acte";
      case "name": return "Nom / Prénom(s)";
      case "birth_date": return "Date de naissance";
      case "birth_place": return "Lieu de naissance";
      case "death_date": return "Date de décès";
      case "death_place": return "Lieu de décès";
      case "occupation": return "Profession";
      case "father": return "Père";
      case "father_occupation": return "Profession du père";
      case "father_status": return "État du père (vivant/décédé)";
      case "father_death_date": return "Date de décès du père";
      case "father_death_place": return "Lieu de décès du père";
      case "father_birth_date": return "Date naiss. père (déduite)";
      case "father_birth_place": return "Lieu de naissance du père";
      case "mother": return "Mère";
      case "mother_occupation": return "Profession de la mère";
      case "mother_status": return "État de la mère (vivant/décédée)";
      case "mother_death_date": return "Date de décès de la mère";
      case "mother_death_place": return "Lieu de décès de la mère";
      case "mother_birth_date": return "Date naiss. mère (déduite)";
      case "mother_birth_place": return "Lieu de naissance de la mère";
      case "spouse": return "Conjoint(e) / Époux(se)";
      case "spouse_occupation": return "Profession du conjoint";
      case "spouse_birth_date": return "Date naiss. conjoint";
      case "spouse_birth_place": return "Lieu naiss. conjoint";
      case "marriage_date": return "Date de mariage";
      case "marriage_place": return "Lieu de mariage";
      case "spouse_father": return "Père du conjoint";
      case "spouse_father_occupation": return "Profession père conjoint";
      case "spouse_father_status": return "État père conjoint";
      case "spouse_mother": return "Mère du conjoint";
      case "spouse_mother_occupation": return "Profession mère conjoint";
      case "spouse_mother_status": return "État mère conjoint";
      default: return key;
    }
  };

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

  // Afficher et mettre en valeur la source dans l'onglet Transcription
  const handleToggleSource = useCallback((fieldKey: string) => {
    setPinnedSourceKey(fieldKey);
    setSidebarTab("transcription");
  }, []);

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
      setOcrCropRef(null);
      setPinnedSourceKey(null);
      setMode("pan");
      setSidebarTab("compare");
      setFilterMode("changes");
      setSelectedFieldKeys(new Set());
      setAppendToNotes(false);
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

    const currentCrop = cropBox && cropBox.width > 20 && cropBox.height > 20 ? { ...cropBox } : null;
    setOcrCropRef(currentCrop);
    setPinnedSourceKey(null);

    try {
      const res = await fetch("/api/ocr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: ac.signal,
        body: JSON.stringify({
          imageUrl,
          crop: currentCrop || undefined,
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
      if (selectedFieldKeys.has("birth_date") && (fieldBirthDate.trim() || fieldDate.trim())) {
        fd.append("birth_date_raw", (fieldBirthDate || fieldDate).trim());
      }
      if (selectedFieldKeys.has("birth_place") && (fieldBirthPlace.trim() || fieldPlace.trim())) {
        fd.append("birth_place", (fieldBirthPlace || fieldPlace).trim());
      }
      if (selectedFieldKeys.has("death_date") && (fieldDeathDate.trim() || fieldDate.trim())) {
        fd.append("death_date_raw", (fieldDeathDate || fieldDate).trim());
      }
      if (selectedFieldKeys.has("death_place") && (fieldDeathPlace.trim() || fieldPlace.trim())) {
        fd.append("death_place", (fieldDeathPlace || fieldPlace).trim());
      }

      // Contexte IDs parents et conjoints
      const isMarriage = actKind === "marriage" || Boolean(unionId);
      const fatherId = isMarriage ? currentContext?.union?.partner1Father?.id : currentContext?.person?.father?.id;
      const motherId = isMarriage ? currentContext?.union?.partner1Mother?.id : currentContext?.person?.mother?.id;
      const spouseId = isMarriage ? currentContext?.union?.partner2?.id : undefined;
      const spouseFatherId = isMarriage ? currentContext?.union?.partner2Father?.id : undefined;
      const spouseMotherId = isMarriage ? currentContext?.union?.partner2Mother?.id : undefined;

      if (fatherId) fd.append("father_id", String(fatherId));
      if (motherId) fd.append("mother_id", String(motherId));
      if (spouseId) fd.append("spouse_id", String(spouseId));
      if (spouseFatherId) fd.append("spouse_father_id", String(spouseFatherId));
      if (spouseMotherId) fd.append("spouse_mother_id", String(spouseMotherId));

      // Père (du sujet ou époux 1)
      if (fieldFather.trim()) {
        const fParts = splitFullName(fieldFather.trim());
        if (selectedFieldKeys.has("father")) {
          fd.append("father_given_names", fParts.given_names);
          fd.append("father_surname", fParts.surname);
        } else if (!fatherId) {
          // Si le père n'est pas encore lié mais qu'on a un nom pour une création
          fd.append("father_given_names", fParts.given_names);
          fd.append("father_surname", fParts.surname);
        }
      }
      if (createFather) fd.append("create_father", "1");
      if (selectedFieldKeys.has("father_occupation") && fieldFatherOccupation.trim()) fd.append("father_occupation", fieldFatherOccupation.trim());
      if (selectedFieldKeys.has("father_status")) fd.append("father_is_deceased", fatherIsDeceased ? "1" : "0");
      if (selectedFieldKeys.has("father_death_date") && fieldFatherDeathDate.trim()) fd.append("father_death_date_raw", fieldFatherDeathDate.trim());
      if (selectedFieldKeys.has("father_death_place") && fieldFatherDeathPlace.trim()) fd.append("father_death_place", fieldFatherDeathPlace.trim());
      if (selectedFieldKeys.has("father_birth_date") && fieldFatherBirthDate.trim()) fd.append("father_birth_date_raw", fieldFatherBirthDate.trim());
      if (selectedFieldKeys.has("father_birth_place") && fieldFatherBirthPlace.trim()) fd.append("father_birth_place", fieldFatherBirthPlace.trim());

      // Mère (du sujet ou époux 1)
      if (fieldMother.trim()) {
        const mParts = splitFullName(fieldMother.trim());
        if (selectedFieldKeys.has("mother")) {
          fd.append("mother_given_names", mParts.given_names);
          fd.append("mother_surname", mParts.surname);
        } else if (!motherId) {
          fd.append("mother_given_names", mParts.given_names);
          fd.append("mother_surname", mParts.surname);
        }
      }
      if (createMother) fd.append("create_mother", "1");
      if (selectedFieldKeys.has("mother_occupation") && fieldMotherOccupation.trim()) fd.append("mother_occupation", fieldMotherOccupation.trim());
      if (selectedFieldKeys.has("mother_status")) fd.append("mother_is_deceased", motherIsDeceased ? "1" : "0");
      if (selectedFieldKeys.has("mother_death_date") && fieldMotherDeathDate.trim()) fd.append("mother_death_date_raw", fieldMotherDeathDate.trim());
      if (selectedFieldKeys.has("mother_death_place") && fieldMotherDeathPlace.trim()) fd.append("mother_death_place", fieldMotherDeathPlace.trim());
      if (selectedFieldKeys.has("mother_birth_date") && fieldMotherBirthDate.trim()) fd.append("mother_birth_date_raw", fieldMotherBirthDate.trim());
      if (selectedFieldKeys.has("mother_birth_place") && fieldMotherBirthPlace.trim()) fd.append("mother_birth_place", fieldMotherBirthPlace.trim());

      // Conjoint & Mariage (Partenaire 2)
      if (fieldSpouse.trim()) {
        const sParts = splitFullName(fieldSpouse.trim());
        if (selectedFieldKeys.has("spouse") || !spouseId) {
          fd.append("spouse_given_names", sParts.given_names);
          fd.append("spouse_surname", sParts.surname);
        }
      }
      if (selectedFieldKeys.has("spouse_occupation") && fieldSpouseOccupation.trim()) fd.append("spouse_occupation", fieldSpouseOccupation.trim());
      if (selectedFieldKeys.has("spouse_birth_date") && fieldSpouseBirthDate.trim()) fd.append("spouse_birth_date_raw", fieldSpouseBirthDate.trim());
      if (selectedFieldKeys.has("spouse_birth_place") && fieldSpouseBirthPlace.trim()) fd.append("spouse_birth_place", fieldSpouseBirthPlace.trim());

      // Parents de l'épouse / Conjoint (Partenaire 2)
      if (fieldSpouseFather.trim()) {
        const sfParts = splitFullName(fieldSpouseFather.trim());
        if (selectedFieldKeys.has("spouse_father") || !spouseFatherId) {
          fd.append("spouse_father_given_names", sfParts.given_names);
          fd.append("spouse_father_surname", sfParts.surname);
        }
      }
      if (selectedFieldKeys.has("spouse_father_occupation") && fieldSpouseFatherOccupation.trim()) fd.append("spouse_father_occupation", fieldSpouseFatherOccupation.trim());
      if (selectedFieldKeys.has("spouse_father_status")) fd.append("spouse_father_is_deceased", spouseFatherIsDeceased ? "1" : "0");

      if (fieldSpouseMother.trim()) {
        const smParts = splitFullName(fieldSpouseMother.trim());
        if (selectedFieldKeys.has("spouse_mother") || !spouseMotherId) {
          fd.append("spouse_mother_given_names", smParts.given_names);
          fd.append("spouse_mother_surname", smParts.surname);
        }
      }
      if (selectedFieldKeys.has("spouse_mother_occupation") && fieldSpouseMotherOccupation.trim()) fd.append("spouse_mother_occupation", fieldSpouseMotherOccupation.trim());
      if (selectedFieldKeys.has("spouse_mother_status")) fd.append("spouse_mother_is_deceased", spouseMotherIsDeceased ? "1" : "0");

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
        try {
          const fresh = await getActViewerContextAction(slug, personId, unionId);
          setCurrentContext(fresh);
          router.refresh();
        } catch (err) {
          console.warn("Erreur rafraîchissement contexte:", err);
        }
        setSelectedFieldKeys(new Set());
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
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs transition-colors cursor-pointer ${
                mode === "pan"
                  ? "bg-fg text-accent-fg font-medium shadow-xs"
                  : "text-fg-muted hover:text-fg hover:bg-surface-2"
              }`}
            >
              <span>Déplacer</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("select");
                if (!ocrOpen) setOcrOpen(true);
              }}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs transition-colors cursor-pointer ${
                mode === "select"
                  ? "bg-fg text-accent-fg font-medium shadow-xs"
                  : "text-fg-muted hover:text-fg hover:bg-surface-2"
              }`}
            >
              <span>Sélectionner l’acte</span>
            </button>
            {cropBox && cropBox.width > 0 && (
              <button
                type="button"
                onClick={() => setCropBox(null)}
                className="rounded-full px-2.5 py-1.5 text-xs text-fg-subtle hover:text-fg hover:bg-surface-2 cursor-pointer"
                title="Effacer la sélection"
              >
                ✕ Effacer
              </button>
            )}
          </div>
        </main>

        {/* Panneau latéral OCR & Transcription parfaitement remodelé et confortable */}
        {ocrOpen && (
          <aside className="w-[680px] max-w-[95vw] lg:w-[780px] xl:w-[860px] border-l border-border bg-surface flex flex-col shrink-0 z-20 shadow-2xl animate-in slide-in-from-right duration-200">
            {/* En-tête du panneau avec navigation par onglets */}
            <div className="flex items-center justify-between border-b border-border px-4 py-2.5 bg-surface shrink-0">
              {transcription ? (
                <div className="flex items-center gap-1 bg-surface-2 p-1 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setSidebarTab("compare")}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                      sidebarTab === "compare"
                        ? "bg-surface text-fg shadow-2xs font-semibold"
                        : "text-fg-muted hover:text-fg"
                    }`}
                  >
                    <span>Données & Fiche</span>
                    {selectedFieldKeys.size > 0 && (
                      <span className="rounded-full bg-fg text-accent-fg px-1.5 py-0.2 text-[10px] font-semibold">
                        {selectedFieldKeys.size}
                      </span>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setSidebarTab("transcription")}
                    className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                      sidebarTab === "transcription"
                        ? "bg-surface text-fg shadow-2xs font-semibold"
                        : "text-fg-muted hover:text-fg"
                    }`}
                  >
                    <span>Transcription</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSidebarTab("settings")}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                      sidebarTab === "settings"
                        ? "bg-surface text-fg shadow-2xs font-semibold"
                        : "text-fg-muted hover:text-fg"
                    }`}
                    title="Paramètres de transcription et sélection"
                  >
                    <span>Paramètres</span>
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-sm text-fg">Transcription & Analyse</h3>
                </div>
              )}

              <button
                type="button"
                onClick={() => setOcrOpen(false)}
                className="rounded-lg p-1.5 text-fg-subtle hover:text-fg hover:bg-surface-2 cursor-pointer transition-colors"
                title="Fermer le panneau"
              >
                ✕
              </button>
            </div>

            {/* Corps du panneau défilant */}
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 text-xs">
              {/* Statut de chargement OCR */}
              {ocrLoading ? (
                <div className="flex flex-col items-center justify-center py-14 gap-3.5">
                  <div className="flex items-center justify-center size-12 rounded-2xl bg-surface-2 border border-border shadow-xs">
                    <span className="inline-block size-6 rounded-full border-2 border-fg border-t-transparent animate-spin" />
                  </div>
                  <div className="text-center">
                    <div className="text-sm font-semibold text-fg">
                      {ocrProgress || `Analyse en cours (${ocrElapsed}s)…`}
                    </div>
                    <p className="text-xs text-fg-muted mt-1 max-w-xs leading-relaxed">
                      {ocrEngine === "gemini"
                        ? "L'IA paléographe déchiffre l'écriture ancienne et extrait les données généalogiques…"
                        : "Le moteur Tesseract analyse les caractères du document…"}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleCancelOcr}
                    className="mt-2 rounded-xl border border-border bg-surface px-4 py-2 text-xs font-medium text-fg-subtle hover:text-fg hover:bg-surface-2 transition-colors cursor-pointer"
                  >
                    ✕ Annuler l'analyse
                  </button>
                </div>
              ) : sidebarTab === "settings" || !transcription ? (
                /* Onglet 1 / Mode initial : Paramètres de numérisation & lancement */
                <div className="flex flex-col gap-4">
                  {/* Choix de la zone */}
                  <div className="rounded-2xl border border-border bg-surface-2/40 p-3.5 flex flex-col gap-2">
                    <span className="font-semibold text-fg text-xs uppercase tracking-wider">
                      1. Zone à transcrire
                    </span>
                    {cropBox && cropBox.width > 20 && cropBox.height > 20 ? (
                      <div className="flex items-center justify-between gap-2 text-ok font-medium">
                        <span>
                          ✓ Rectangle sélectionné ({cropBox.width} × {cropBox.height} px)
                        </span>
                        <button
                          type="button"
                          onClick={() => setCropBox(null)}
                          className="text-fg-muted hover:text-fg underline text-[11px] font-normal cursor-pointer"
                        >
                          Toute la page
                        </button>
                      </div>
                    ) : (
                      <div className="text-fg-muted flex flex-col gap-2">
                        <p className="text-xs leading-relaxed">
                          Toute la page sera analysée. Pour isoler un acte précis, activez « Sélectionner l'acte » et tracez un rectangle sur le registre.
                        </p>
                        <button
                          type="button"
                          onClick={() => setMode("select")}
                          className="self-start rounded-xl border border-border bg-surface px-3 py-1.5 text-xs font-medium text-fg hover:bg-surface-2 transition-colors cursor-pointer"
                        >
                          Tracer un rectangle sur l'acte
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Choix du moteur */}
                  <div className="rounded-2xl border border-border bg-surface-2/40 p-3.5 flex flex-col gap-2.5">
                    <span className="font-semibold text-fg text-xs uppercase tracking-wider">
                      2. Moteur de transcription
                    </span>

                    <label
                      className={`flex cursor-pointer items-start gap-2.5 rounded-xl border p-3 transition-colors ${
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
                        <div className="font-semibold text-fg">IA Paléographe (Gemini 3.8 Flash)</div>
                        <div className="text-[11px] text-fg-muted font-normal mt-0.5">
                          Transcription experte de l'écriture manuscrite ancienne (XVIe au XXe siècle).
                        </div>
                      </div>
                    </label>

                    <label
                      className={`flex cursor-pointer items-start gap-2.5 rounded-xl border p-3 transition-colors ${
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
                        <div className="font-semibold text-fg">Tesseract (Local hors-ligne)</div>
                        <div className="text-[11px] text-fg-muted font-normal mt-0.5">
                          Sans clé requise. Efficace pour les imprimés, tables décennales et formulaires.
                        </div>
                      </div>
                    </label>

                    {/* Clé API */}
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

                  {/* Bouton de lancement */}
                  <button
                    type="button"
                    onClick={handleRunOcr}
                    className="w-full rounded-xl bg-fg py-3 text-xs font-semibold text-accent-fg transition-opacity hover:opacity-90 cursor-pointer shadow-xs"
                  >
                    {transcription ? "Relancer l'analyse" : "Lancer la transcription"}
                  </button>
                </div>
              ) : sidebarTab === "transcription" ? (
                /* Onglet 2 : Transcription intégrale */
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between border-b border-border pb-2.5">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-fg text-sm">Transcription paléographique</span>
                      <button
                        type="button"
                        onClick={() => setEditMode((v) => !v)}
                        className={`rounded-lg px-2 py-1 text-[11px] transition-colors cursor-pointer ${
                          editMode
                            ? "bg-fg text-accent-fg font-medium"
                            : "text-fg-subtle hover:text-fg hover:bg-surface-2"
                        }`}
                      >
                        {editMode ? "Aperçu formaté" : "Modifier texte"}
                      </button>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={handleCopyTranscription}
                        className="rounded-lg border border-border bg-surface px-2.5 py-1 text-[11px] font-medium text-fg hover:bg-surface-2 transition-colors cursor-pointer"
                      >
                        {copySuccess ? "Copié !" : "Copier"}
                      </button>
                      {slug && (personId || unionId) && (
                        <button
                          type="button"
                          onClick={handleSaveToNotes}
                          disabled={pendingSave}
                          className="rounded-lg bg-fg text-accent-fg px-2.5 py-1 text-[11px] font-medium hover:opacity-90 transition-opacity cursor-pointer"
                        >
                          {saveSuccess ? "Enregistré !" : "Enregistrer dans notes"}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Indicateur de source épinglée */}
                  {pinnedSourceKey && getSourceForField(pinnedSourceKey)?.text && (
                    <div className="flex items-center justify-between gap-2 px-3 py-2 bg-amber-400/10 border border-amber-400/30 text-amber-900 dark:text-amber-200 rounded-xl text-xs">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-semibold shrink-0">Source ({getFieldLabel(pinnedSourceKey)}) :</span>
                        <span className="italic truncate font-serif">« {getSourceForField(pinnedSourceKey)!.text} »</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setPinnedSourceKey(null)}
                        className="text-xs hover:opacity-75 shrink-0 px-1 font-bold cursor-pointer"
                        title="Désépingler"
                      >
                        ✕
                      </button>
                    </div>
                  )}

                  {editMode ? (
                    <textarea
                      rows={16}
                      value={transcription}
                      onChange={(e) => setTranscription(e.target.value)}
                      placeholder="La transcription s'affiche ici…"
                      className="field w-full rounded-xl p-3 text-xs font-mono leading-relaxed resize-none min-h-[300px]"
                    />
                  ) : (() => {
                    const activeQuote = pinnedSourceKey ? getSourceForField(pinnedSourceKey)?.text?.trim() : undefined;
                    if (activeQuote && transcription.toLowerCase().includes(activeQuote.toLowerCase())) {
                      const idx = transcription.toLowerCase().indexOf(activeQuote.toLowerCase());
                      const before = transcription.slice(0, idx);
                      const match = transcription.slice(idx, idx + activeQuote.length);
                      const after = transcription.slice(idx + activeQuote.length);
                      return (
                        <div className="overflow-y-auto max-h-[460px] p-3.5 bg-surface-2/40 rounded-xl border border-border/60 text-xs text-fg leading-relaxed whitespace-pre-wrap font-sans">
                          <span>{before}</span>
                          <mark className="bg-amber-300 dark:bg-amber-500/40 text-amber-950 dark:text-amber-100 px-1 py-0.5 rounded font-semibold ring-2 ring-amber-400 animate-pulse shadow-xs">
                            {match}
                          </mark>
                          <span>{after}</span>
                        </div>
                      );
                    }
                    return (
                      <div className="overflow-y-auto max-h-[460px] p-3.5 bg-surface-2/40 rounded-xl border border-border/60 text-xs text-fg leading-relaxed">
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

                  <p className="text-[11px] text-fg-subtle">
                    {editMode
                      ? "Vous éditez le texte source. Vos corrections se répercutent si vous cliquez sur Ré-analyser."
                      : "Cliquez sur « Modifier texte » pour ajuster des mots ou corriger la transcription."}
                  </p>
                </div>
              ) : (
                /* Onglet 3 : Vue comparative Avant / Après entièrement remodelée */
                (() => {
                  if (!slug || (!personId && !unionId)) {
                    return (
                      <div className="rounded-2xl border border-border bg-surface-2/30 p-6 text-center text-fg-muted flex flex-col items-center gap-2">
                        <span className="font-semibold text-fg text-sm">Visionneuse isolée</span>
                        <p className="max-w-md text-xs">
                          Ouvrez la visionneuse depuis une personne ou une union pour comparer les données extraites avec la fiche et les injecter directement.
                        </p>
                      </div>
                    );
                  }

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
                        "father_occupation",
                        "father_status",
                        "father_birth_date",
                        "father_birth_place",
                        "mother",
                        "mother_occupation",
                        "mother_status",
                        "mother_birth_date",
                        "mother_birth_place",
                        "spouse",
                        "spouse_occupation",
                        "spouse_birth_date",
                        "spouse_birth_place",
                        "spouse_father",
                        "spouse_father_status",
                        "spouse_mother",
                        "spouse_mother_status",
                      ]
                    : actKind === "birth"
                    ? [
                        "birth_date",
                        "birth_place",
                        "name",
                        "occupation",
                        "death_date",
                        "death_place",
                        "father",
                        "father_occupation",
                        "father_status",
                        "father_birth_date",
                        "father_birth_place",
                        "father_death_date",
                        "father_death_place",
                        "mother",
                        "mother_occupation",
                        "mother_status",
                        "mother_birth_date",
                        "mother_birth_place",
                        "mother_death_date",
                        "mother_death_place",
                        "spouse",
                        "marriage_date",
                        "marriage_place",
                      ]
                    : [
                        "death_date",
                        "death_place",
                        "name",
                        "occupation",
                        "birth_date",
                        "birth_place",
                        "father",
                        "father_occupation",
                        "father_status",
                        "father_birth_date",
                        "father_birth_place",
                        "father_death_date",
                        "father_death_place",
                        "mother",
                        "mother_occupation",
                        "mother_status",
                        "mother_birth_date",
                        "mother_birth_place",
                        "mother_death_date",
                        "mother_death_place",
                        "spouse",
                        "marriage_date",
                        "marriage_place",
                      ];

                  // Helper pour déterminer si un champ textuel apporte une modification
                  const isTextDiff = (currentVal: string | null | undefined, proposedVal: string) => {
                    const cur = (currentVal || "").trim();
                    const prop = proposedVal.trim();
                    return Boolean(prop && prop !== cur);
                  };

                  // Calcul du nombre de changements réels détectés
                  let totalChangesCount = 0;
                  if (isMarriage) {
                    if (isTextDiff(currentContext?.union?.date_raw, fieldMarriageDate)) totalChangesCount++;
                    if (isTextDiff(currentContext?.union?.place, fieldMarriagePlace)) totalChangesCount++;
                    if (isTextDiff(currentContext?.union?.partner1?.displayName || currentContext?.person?.displayName, `${fieldGivenNames} ${fieldSurname}`.trim())) totalChangesCount++;
                    if (isTextDiff(currentContext?.union?.partner1?.occupation || currentContext?.person?.occupation, fieldOccupation)) totalChangesCount++;
                    if (isTextDiff(currentContext?.union?.partner1?.birth_date_raw || currentContext?.person?.birth_date_raw, fieldBirthDate)) totalChangesCount++;
                    if (isTextDiff(currentContext?.union?.partner1?.birth_place || currentContext?.person?.birth_place, fieldBirthPlace)) totalChangesCount++;
                    if (isTextDiff(currentContext?.union?.partner1Father?.displayName || currentContext?.person?.father?.displayName, fieldFather)) totalChangesCount++;
                    if (isTextDiff(null, fieldFatherOccupation)) totalChangesCount++;
                    if (Boolean(currentContext?.union?.partner1Father?.is_living === 0 || currentContext?.person?.father?.is_living === 0) !== fatherIsDeceased) totalChangesCount++;
                    if (isTextDiff(currentContext?.union?.partner1Father?.birth_date_raw || currentContext?.person?.father?.birth_date_raw, fieldFatherBirthDate)) totalChangesCount++;
                    if (isTextDiff(currentContext?.union?.partner1Father?.birth_place || currentContext?.person?.father?.birth_place, fieldFatherBirthPlace)) totalChangesCount++;
                    if (isTextDiff(currentContext?.union?.partner1Mother?.displayName || currentContext?.person?.mother?.displayName, fieldMother)) totalChangesCount++;
                    if (isTextDiff(null, fieldMotherOccupation)) totalChangesCount++;
                    if (Boolean(currentContext?.union?.partner1Mother?.is_living === 0 || currentContext?.person?.mother?.is_living === 0) !== motherIsDeceased) totalChangesCount++;
                    if (isTextDiff(currentContext?.union?.partner1Mother?.birth_date_raw || currentContext?.person?.mother?.birth_date_raw, fieldMotherBirthDate)) totalChangesCount++;
                    if (isTextDiff(currentContext?.union?.partner1Mother?.birth_place || currentContext?.person?.mother?.birth_place, fieldMotherBirthPlace)) totalChangesCount++;
                    if (isTextDiff(currentContext?.union?.partner2?.displayName, fieldSpouse)) totalChangesCount++;
                    if (isTextDiff(currentContext?.union?.partner2?.occupation, fieldSpouseOccupation)) totalChangesCount++;
                    if (isTextDiff(currentContext?.union?.partner2?.birth_date_raw, fieldSpouseBirthDate)) totalChangesCount++;
                    if (isTextDiff(currentContext?.union?.partner2?.birth_place, fieldSpouseBirthPlace)) totalChangesCount++;
                    if (isTextDiff(currentContext?.union?.partner2Father?.displayName, fieldSpouseFather)) totalChangesCount++;
                    if (Boolean(currentContext?.union?.partner2Father?.is_living === 0) !== spouseFatherIsDeceased) totalChangesCount++;
                    if (isTextDiff(currentContext?.union?.partner2Mother?.displayName, fieldSpouseMother)) totalChangesCount++;
                    if (Boolean(currentContext?.union?.partner2Mother?.is_living === 0) !== spouseMotherIsDeceased) totalChangesCount++;
                  } else if (actKind === "birth") {
                    if (isTextDiff(currentContext?.person?.birth_date_raw, fieldBirthDate || fieldDate)) totalChangesCount++;
                    if (isTextDiff(currentContext?.person?.birth_place, fieldBirthPlace || fieldPlace)) totalChangesCount++;
                    if (isTextDiff(currentContext?.person?.displayName, `${fieldGivenNames} ${fieldSurname}`.trim())) totalChangesCount++;
                    if (isTextDiff(currentContext?.person?.occupation, fieldOccupation)) totalChangesCount++;
                    if (isTextDiff(currentContext?.person?.death_date_raw, fieldDeathDate)) totalChangesCount++;
                    if (isTextDiff(currentContext?.person?.death_place, fieldDeathPlace)) totalChangesCount++;
                    if (isTextDiff(currentContext?.person?.father?.displayName, fieldFather)) totalChangesCount++;
                    if (isTextDiff(null, fieldFatherOccupation)) totalChangesCount++;
                    if (Boolean(currentContext?.person?.father?.is_living === 0) !== fatherIsDeceased) totalChangesCount++;
                    if (isTextDiff(currentContext?.person?.father?.birth_date_raw, fieldFatherBirthDate)) totalChangesCount++;
                    if (isTextDiff(currentContext?.person?.father?.birth_place, fieldFatherBirthPlace)) totalChangesCount++;
                    if (isTextDiff(null, fieldFatherDeathDate)) totalChangesCount++;
                    if (isTextDiff(null, fieldFatherDeathPlace)) totalChangesCount++;
                    if (isTextDiff(currentContext?.person?.mother?.displayName, fieldMother)) totalChangesCount++;
                    if (isTextDiff(null, fieldMotherOccupation)) totalChangesCount++;
                    if (Boolean(currentContext?.person?.mother?.is_living === 0) !== motherIsDeceased) totalChangesCount++;
                    if (isTextDiff(currentContext?.person?.mother?.birth_date_raw, fieldMotherBirthDate)) totalChangesCount++;
                    if (isTextDiff(currentContext?.person?.mother?.birth_place, fieldMotherBirthPlace)) totalChangesCount++;
                    if (isTextDiff(null, fieldMotherDeathDate)) totalChangesCount++;
                    if (isTextDiff(null, fieldMotherDeathPlace)) totalChangesCount++;
                    if (isTextDiff(currentContext?.union?.partner2?.displayName, fieldSpouse)) totalChangesCount++;
                    if (isTextDiff(currentContext?.union?.date_raw, fieldMarriageDate)) totalChangesCount++;
                    if (isTextDiff(currentContext?.union?.place, fieldMarriagePlace)) totalChangesCount++;
                  } else {
                    if (isTextDiff(currentContext?.person?.death_date_raw, fieldDate || fieldDeathDate)) totalChangesCount++;
                    if (isTextDiff(currentContext?.person?.death_place, fieldPlace || fieldDeathPlace)) totalChangesCount++;
                    if (isTextDiff(currentContext?.person?.displayName, `${fieldGivenNames} ${fieldSurname}`.trim())) totalChangesCount++;
                    if (isTextDiff(currentContext?.person?.occupation, fieldOccupation)) totalChangesCount++;
                    if (isTextDiff(currentContext?.person?.birth_date_raw, fieldBirthDate)) totalChangesCount++;
                    if (isTextDiff(currentContext?.person?.birth_place, fieldBirthPlace)) totalChangesCount++;
                    if (isTextDiff(currentContext?.person?.father?.displayName, fieldFather)) totalChangesCount++;
                    if (isTextDiff(null, fieldFatherOccupation)) totalChangesCount++;
                    if (Boolean(currentContext?.person?.father?.is_living === 0) !== fatherIsDeceased) totalChangesCount++;
                    if (isTextDiff(currentContext?.person?.father?.birth_date_raw, fieldFatherBirthDate)) totalChangesCount++;
                    if (isTextDiff(currentContext?.person?.father?.birth_place, fieldFatherBirthPlace)) totalChangesCount++;
                    if (isTextDiff(null, fieldFatherDeathDate)) totalChangesCount++;
                    if (isTextDiff(null, fieldFatherDeathPlace)) totalChangesCount++;
                    if (isTextDiff(currentContext?.person?.mother?.displayName, fieldMother)) totalChangesCount++;
                    if (isTextDiff(null, fieldMotherOccupation)) totalChangesCount++;
                    if (Boolean(currentContext?.person?.mother?.is_living === 0) !== motherIsDeceased) totalChangesCount++;
                    if (isTextDiff(currentContext?.person?.mother?.birth_date_raw, fieldMotherBirthDate)) totalChangesCount++;
                    if (isTextDiff(currentContext?.person?.mother?.birth_place, fieldMotherBirthPlace)) totalChangesCount++;
                    if (isTextDiff(null, fieldMotherDeathDate)) totalChangesCount++;
                    if (isTextDiff(null, fieldMotherDeathPlace)) totalChangesCount++;
                    if (isTextDiff(currentContext?.union?.partner2?.displayName, fieldSpouse)) totalChangesCount++;
                    if (isTextDiff(currentContext?.union?.date_raw, fieldMarriageDate)) totalChangesCount++;
                    if (isTextDiff(currentContext?.union?.place, fieldMarriagePlace)) totalChangesCount++;
                  }

                  const renderFieldCard = (
                    key: string,
                    label: string,
                    currentVal: string | null | undefined,
                    proposedVal: string,
                    onChangeProposed: (v: string) => void,
                    placeholder?: string
                  ) => {
                    const cur = (currentVal || "").trim();
                    const prop = proposedVal.trim();
                    const isEmpty = !prop;
                    const isNew = Boolean(prop && !cur);
                    const isModified = Boolean(prop && cur && prop !== cur);
                    const isSame = Boolean(prop && cur && prop === cur);
                    const isDiff = isNew || isModified;
                    const isChecked = selectedFieldKeys.has(key);
                    const src = getSourceForField(key);
                    const isPinned = pinnedSourceKey === key;

                    if (filterMode === "changes" && !isDiff && !isChecked) {
                      return null;
                    }

                    return (
                      <div
                        key={key}
                        className={`rounded-xl border p-3 transition-all flex flex-col gap-2.5 ${
                          isChecked
                            ? "border-border bg-surface shadow-xs"
                            : "border-border/40 bg-surface-2/20 opacity-80 hover:opacity-100"
                        }`}
                      >
                        {/* En-tête de la carte */}
                        <div className="flex items-center justify-between gap-2">
                          <label className="flex items-center gap-2 cursor-pointer select-none min-w-0">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => toggleFieldKey(key)}
                              disabled={isEmpty}
                              className="accent-fg rounded size-3.5 cursor-pointer shrink-0"
                            />
                            <span className="font-semibold text-xs text-fg truncate">
                              {label}
                            </span>
                          </label>

                          <div className="flex items-center gap-1.5 shrink-0">
                            {isNew && (
                              <span className="rounded-md bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                                + Nouveau
                              </span>
                            )}
                            {isModified && (
                              <span className="rounded-md bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
                                ✎ Modifié
                              </span>
                            )}
                            {isSame && (
                              <span className="rounded-md bg-surface-2 border border-border/60 px-2 py-0.5 text-[10px] text-fg-subtle">
                                Identique
                              </span>
                            )}
                            {isEmpty && (
                              <span className="rounded-md px-2 py-0.5 text-[10px] text-fg-subtle italic">
                                Non détecté
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Grille comparative : Actuel vs Détecté */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                          <div className="flex flex-col gap-0.5 rounded-lg bg-surface-2/60 border border-border/50 px-2.5 py-1.5 min-w-0">
                            <span className="text-[10px] text-fg-subtle uppercase tracking-wider font-medium">Actuel dans la fiche</span>
                            <span className="truncate text-xs font-normal" title={currentVal || "Non renseigné"}>
                              {currentVal ? (
                                <span className="font-medium text-fg">{currentVal}</span>
                              ) : (
                                <span className="italic text-fg-subtle text-[11px]">— Non renseigné</span>
                              )}
                            </span>
                          </div>

                          <div className="flex flex-col gap-0.5 min-w-0">
                            <span className="text-[10px] text-fg-subtle uppercase tracking-wider font-medium">Détecté dans l'acte</span>
                            <input
                              type="text"
                              value={proposedVal}
                              onChange={(e) => onChangeProposed(e.target.value)}
                              placeholder={placeholder || "Non détecté"}
                              className={`field w-full text-xs font-medium py-1 px-2.5 ${
                                isDiff && !isEmpty
                                  ? "border-emerald-500/40 bg-emerald-500/5 text-fg ring-emerald-500/20 font-semibold"
                                  : "text-fg-muted"
                              }`}
                            />
                          </div>
                        </div>

                        {/* Citation textuelle longue dans la transcription */}
                        {src?.text && (
                          <div
                            onClick={() => handleToggleSource(key)}
                            className="flex items-start gap-2 rounded-lg bg-surface-2/60 hover:bg-surface-2 border border-border/60 px-3 py-2 text-xs transition-colors cursor-pointer group"
                            title="Cliquer pour afficher dans la transcription intégrale"
                          >
                            <span className="font-semibold text-fg-subtle shrink-0 group-hover:text-fg">
                              Source :
                            </span>
                            <span className="italic font-serif leading-relaxed text-fg">
                              « {src.text} »
                            </span>
                            <span className="text-[10px] text-fg-subtle group-hover:text-fg underline shrink-0 ml-auto">
                              Transcription ↗
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  };

                  const renderStatusCard = (
                    key: string,
                    label: string,
                    currentDeceased: boolean | undefined,
                    proposedDeceased: boolean,
                    onToggleDeceased: (val: boolean) => void
                  ) => {
                    const isDiff = Boolean(currentDeceased !== proposedDeceased);
                    const isChecked = selectedFieldKeys.has(key);
                    const src = getSourceForField(key);

                    if (filterMode === "changes" && !isDiff && !isChecked) {
                      return null;
                    }

                    return (
                      <div
                        key={key}
                        className={`rounded-xl border p-3 transition-all flex flex-col gap-2.5 ${
                          isChecked
                            ? "border-border bg-surface shadow-xs"
                            : "border-border/40 bg-surface-2/20 opacity-80 hover:opacity-100"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <label className="flex items-center gap-2 cursor-pointer select-none min-w-0">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => toggleFieldKey(key)}
                              className="accent-fg rounded size-3.5 cursor-pointer shrink-0"
                            />
                            <span className="font-semibold text-xs text-fg truncate">
                              {label}
                            </span>
                          </label>

                          <div className="flex items-center gap-1.5 shrink-0">
                            {isDiff && (
                              <span className="rounded-md bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
                                ✎ Modifié
                              </span>
                            )}
                            {!isDiff && (
                              <span className="rounded-md bg-surface-2 border border-border/60 px-2 py-0.5 text-[10px] text-fg-subtle">
                                Identique
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                          <div className="flex flex-col gap-0.5 rounded-lg bg-surface-2/60 border border-border/50 px-2.5 py-1.5">
                            <span className="text-[10px] text-fg-subtle uppercase tracking-wider font-medium">Actuel dans la fiche</span>
                            <span className="text-xs font-medium">
                              {currentDeceased ? (
                                <span className="text-danger">Décédé(e)</span>
                              ) : (
                                <span className="text-ok">Vivant(e) / Non précisé</span>
                              )}
                            </span>
                          </div>

                          <div className="flex flex-col gap-0.5 justify-center">
                            <span className="text-[10px] text-fg-subtle uppercase tracking-wider font-medium">Statut dans l'acte</span>
                            <label className="flex items-center gap-2 text-xs cursor-pointer select-none py-1">
                              <input
                                type="checkbox"
                                checked={proposedDeceased}
                                onChange={(e) => onToggleDeceased(e.target.checked)}
                                className="accent-fg rounded"
                              />
                              <span className={proposedDeceased ? "font-semibold text-danger" : "text-fg-muted"}>
                                {proposedDeceased ? "Décédé(e) au moment de l'acte" : "Vivant(e) au moment de l'acte"}
                              </span>
                            </label>
                          </div>
                        </div>

                        {/* Citation textuelle longue dans la transcription */}
                        {src?.text && (
                          <div
                            onClick={() => handleToggleSource(key)}
                            className="flex items-start gap-2 rounded-lg bg-surface-2/60 hover:bg-surface-2 border border-border/60 px-3 py-2 text-xs transition-colors cursor-pointer group"
                            title="Cliquer pour afficher dans la transcription intégrale"
                          >
                            <span className="font-semibold text-fg-subtle shrink-0 group-hover:text-fg">
                              Source :
                            </span>
                            <span className="italic font-serif leading-relaxed text-fg">
                              « {src.text} »
                            </span>
                            <span className="text-[10px] text-fg-subtle group-hover:text-fg underline shrink-0 ml-auto">
                              Transcription ↗
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  };

                  const renderSection = (title: string, children: React.ReactNode[]) => {
                    const validChildren = children.filter(Boolean);
                    if (validChildren.length === 0) return null;

                    return (
                      <div key={title} className="rounded-2xl border border-border bg-surface-2/30 p-3.5 flex flex-col gap-2.5 shadow-2xs">
                        <div className="flex items-center justify-between border-b border-border/70 pb-2 px-0.5">
                          <span className="font-semibold text-fg text-xs uppercase tracking-wider">
                            {title}
                          </span>
                          <span className="text-[10.5px] text-fg-subtle font-medium">
                            {validChildren.length} champ{validChildren.length > 1 ? "s" : ""}
                          </span>
                        </div>
                        <div className="flex flex-col gap-2.5">
                          {validChildren}
                        </div>
                      </div>
                    );
                  };

                  return (
                    <div className="flex flex-col gap-3.5">
                      {/* Barre d'outils supérieure de la comparaison */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2 border-b border-border">
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="font-semibold text-fg text-sm">
                              Données extraites vs Fiche
                            </h4>
                            <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-[10.5px] font-medium text-fg border border-border/80">
                              {totalChangesCount} modification{totalChangesCount > 1 ? "s" : ""}
                            </span>
                          </div>
                          <p className="mt-0.5 text-[11px] text-fg-muted">
                            Vérifiez les données à gauche (actuel) et à droite (proposé) avant d'enregistrer.
                          </p>
                        </div>

                        <div className="flex items-center gap-2 flex-wrap">
                          {/* Filtre Changements vs Tous */}
                          <div className="flex items-center rounded-xl border border-border bg-surface-2 p-0.5">
                            <button
                              type="button"
                              onClick={() => setFilterMode("changes")}
                              className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors cursor-pointer ${
                                filterMode === "changes"
                                  ? "bg-surface text-fg shadow-2xs font-semibold"
                                  : "text-fg-muted hover:text-fg"
                              }`}
                            >
                              Changements ({totalChangesCount})
                            </button>
                            <button
                              type="button"
                              onClick={() => setFilterMode("all")}
                              className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors cursor-pointer ${
                                filterMode === "all"
                                  ? "bg-surface text-fg shadow-2xs font-semibold"
                                  : "text-fg-muted hover:text-fg"
                              }`}
                            >
                              Tous ({allAvailableKeys.length})
                            </button>
                          </div>

                          {/* Boutons tout cocher / décocher / ré-analyser */}
                          <button
                            type="button"
                            onClick={() => selectAllKeys(allAvailableKeys)}
                            className="rounded-lg border border-border bg-surface px-2 py-1 text-[11px] font-medium text-fg hover:bg-surface-2 transition-colors cursor-pointer"
                          >
                            Tout cocher
                          </button>
                          <button
                            type="button"
                            onClick={deselectAllKeys}
                            className="rounded-lg border border-border bg-surface px-2 py-1 text-[11px] text-fg-subtle hover:text-fg hover:bg-surface-2 transition-colors cursor-pointer"
                          >
                            Décocher
                          </button>
                          <button
                            type="button"
                            onClick={handleSyncFromTranscription}
                            className="rounded-lg border border-border bg-surface px-2 py-1 text-[11px] text-fg-subtle hover:text-fg hover:bg-surface-2 transition-colors cursor-pointer"
                            title="Ré-analyser la transcription"
                          >
                            Ré-analyser
                          </button>
                        </div>
                      </div>

                      {/* Message informatif si aucun changement en mode filtre */}
                      {filterMode === "changes" && totalChangesCount === 0 && (
                        <div className="rounded-xl border border-border bg-surface-2/40 p-4 text-center text-fg-muted">
                          <p className="font-semibold text-fg text-xs">Aucune nouvelle modification détectée</p>
                          <p className="text-[11px] mt-1">
                            Les informations de l'acte correspondent déjà à la fiche, ou aucune nouvelle donnée n'a été trouvée.
                            Basculez sur « Tous » pour visualiser ou forcer des valeurs.
                          </p>
                        </div>
                      )}

                      {/* Sections structurées en cartes claires */}
                      {isMarriage ? (
                        <div className="flex flex-col gap-3">
                          {/* 1. Événement du mariage */}
                          {renderSection("Événement du mariage", [
                            renderFieldCard(
                              "marriage_date",
                              "Date du mariage",
                              currentContext?.union?.date_raw,
                              fieldMarriageDate,
                              setFieldMarriageDate
                            ),
                            renderFieldCard(
                              "marriage_place",
                              "Lieu du mariage",
                              currentContext?.union?.place,
                              fieldMarriagePlace,
                              setFieldMarriagePlace
                            ),
                          ])}

                          {/* 2. Époux (Partenaire 1) */}
                          {renderSection("Époux (Partenaire 1)", [
                            renderFieldCard(
                              "name",
                              "Prénom(s) & Nom époux",
                              currentContext?.union?.partner1?.displayName || currentContext?.person?.displayName,
                              `${fieldGivenNames} ${fieldSurname}`.trim(),
                              (val) => {
                                const p = splitFullName(val);
                                setFieldGivenNames(p.given_names);
                                setFieldSurname(p.surname);
                              }
                            ),
                            renderFieldCard(
                              "occupation",
                              "Métier époux",
                              currentContext?.union?.partner1?.occupation || currentContext?.person?.occupation,
                              fieldOccupation,
                              setFieldOccupation
                            ),
                            renderFieldCard(
                              "birth_date",
                              "Date de naissance époux",
                              currentContext?.union?.partner1?.birth_date_raw || currentContext?.person?.birth_date_raw,
                              fieldBirthDate,
                              setFieldBirthDate
                            ),
                            renderFieldCard(
                              "birth_place",
                              "Lieu de naissance époux",
                              currentContext?.union?.partner1?.birth_place || currentContext?.person?.birth_place,
                              fieldBirthPlace,
                              setFieldBirthPlace
                            ),
                          ])}

                          {/* 3. Parents de l'Époux */}
                          {renderSection("Parents de l'Époux", [
                            renderFieldCard(
                              "father",
                              "Père de l'époux",
                              currentContext?.union?.partner1Father?.displayName || currentContext?.person?.father?.displayName,
                              fieldFather,
                              setFieldFather
                            ),
                            fieldFatherOccupation ? renderFieldCard(
                              "father_occupation",
                              "Métier père époux",
                              currentContext?.union?.partner1Father?.occupation || currentContext?.person?.father?.occupation,
                              fieldFatherOccupation,
                              setFieldFatherOccupation
                            ) : null,
                            renderStatusCard(
                              "father_status",
                              "Statut père époux",
                              currentContext?.union?.partner1Father?.is_living === 0 || currentContext?.person?.father?.is_living === 0,
                              fatherIsDeceased,
                              setFatherIsDeceased
                            ),
                            fieldFatherBirthDate ? renderFieldCard(
                              "father_birth_date",
                              "Date naiss. père (déduite)",
                              currentContext?.union?.partner1Father?.birth_date_raw || currentContext?.person?.father?.birth_date_raw,
                              fieldFatherBirthDate,
                              setFieldFatherBirthDate
                            ) : null,
                            fieldFatherBirthPlace ? renderFieldCard(
                              "father_birth_place",
                              "Lieu naiss. père époux",
                              currentContext?.union?.partner1Father?.birth_place || currentContext?.person?.father?.birth_place,
                              fieldFatherBirthPlace,
                              setFieldFatherBirthPlace
                            ) : null,
                            renderFieldCard(
                              "mother",
                              "Mère de l'époux",
                              currentContext?.union?.partner1Mother?.displayName || currentContext?.person?.mother?.displayName,
                              fieldMother,
                              setFieldMother
                            ),
                            fieldMotherOccupation ? renderFieldCard(
                              "mother_occupation",
                              "Métier mère époux",
                              currentContext?.union?.partner1Mother?.occupation || currentContext?.person?.mother?.occupation,
                              fieldMotherOccupation,
                              setFieldMotherOccupation
                            ) : null,
                            renderStatusCard(
                              "mother_status",
                              "Statut mère époux",
                              currentContext?.union?.partner1Mother?.is_living === 0 || currentContext?.person?.mother?.is_living === 0,
                              motherIsDeceased,
                              setMotherIsDeceased
                            ),
                            fieldMotherBirthDate ? renderFieldCard(
                              "mother_birth_date",
                              "Date naiss. mère (déduite)",
                              currentContext?.union?.partner1Mother?.birth_date_raw || currentContext?.person?.mother?.birth_date_raw,
                              fieldMotherBirthDate,
                              setFieldMotherBirthDate
                            ) : null,
                            fieldMotherBirthPlace ? renderFieldCard(
                              "mother_birth_place",
                              "Lieu naiss. mère époux",
                              currentContext?.union?.partner1Mother?.birth_place || currentContext?.person?.mother?.birth_place,
                              fieldMotherBirthPlace,
                              setFieldMotherBirthPlace
                            ) : null,
                          ])}

                          {/* 4. Épouse (Partenaire 2) */}
                          {renderSection("Épouse (Partenaire 2)", [
                            renderFieldCard(
                              "spouse",
                              "Prénom(s) & Nom épouse",
                              currentContext?.union?.partner2?.displayName,
                              fieldSpouse,
                              setFieldSpouse
                            ),
                            renderFieldCard(
                              "spouse_occupation",
                              "Métier épouse",
                              currentContext?.union?.partner2?.occupation,
                              fieldSpouseOccupation,
                              setFieldSpouseOccupation
                            ),
                            renderFieldCard(
                              "spouse_birth_date",
                              "Date de naissance épouse",
                              currentContext?.union?.partner2?.birth_date_raw,
                              fieldSpouseBirthDate,
                              setFieldSpouseBirthDate
                            ),
                            renderFieldCard(
                              "spouse_birth_place",
                              "Lieu de naissance épouse",
                              currentContext?.union?.partner2?.birth_place,
                              fieldSpouseBirthPlace,
                              setFieldSpouseBirthPlace
                            ),
                          ])}

                          {/* 5. Parents de l'Épouse */}
                          {renderSection("Parents de l'Épouse", [
                            renderFieldCard(
                              "spouse_father",
                              "Père de l'épouse",
                              currentContext?.union?.partner2Father?.displayName,
                              fieldSpouseFather,
                              setFieldSpouseFather
                            ),
                            renderStatusCard(
                              "spouse_father_status",
                              "Statut père épouse",
                              currentContext?.union?.partner2Father?.is_living === 0,
                              spouseFatherIsDeceased,
                              setSpouseFatherIsDeceased
                            ),
                            renderFieldCard(
                              "spouse_mother",
                              "Mère de l'épouse",
                              currentContext?.union?.partner2Mother?.displayName,
                              fieldSpouseMother,
                              setFieldSpouseMother
                            ),
                            renderStatusCard(
                              "spouse_mother_status",
                              "Statut mère épouse",
                              currentContext?.union?.partner2Mother?.is_living === 0,
                              spouseMotherIsDeceased,
                              setSpouseMotherIsDeceased
                            ),
                          ])}
                        </div>
                      ) : (
                        <div className="flex flex-col gap-3">
                          {/* 1. Événement / Acte */}
                          {actKind === "birth" ? (
                            renderSection("Acte de naissance / baptême", [
                              renderFieldCard(
                                "birth_date",
                                "Date de naissance",
                                currentContext?.person?.birth_date_raw,
                                fieldBirthDate || fieldDate,
                                (val) => {
                                  setFieldBirthDate(val);
                                  setFieldDate(val);
                                }
                              ),
                              renderFieldCard(
                                "birth_place",
                                "Lieu de naissance / Paroisse",
                                currentContext?.person?.birth_place,
                                fieldBirthPlace || fieldPlace,
                                (val) => {
                                  setFieldBirthPlace(val);
                                  setFieldPlace(val);
                                }
                              ),
                            ])
                          ) : (
                            renderSection("Acte de décès", [
                              renderFieldCard(
                                "death_date",
                                "Date de décès",
                                currentContext?.person?.death_date_raw,
                                fieldDate || fieldDeathDate,
                                (val) => {
                                  setFieldDate(val);
                                  setFieldDeathDate(val);
                                }
                              ),
                              renderFieldCard(
                                "death_place",
                                "Lieu de décès / Paroisse",
                                currentContext?.person?.death_place,
                                fieldPlace || fieldDeathPlace,
                                (val) => {
                                  setFieldPlace(val);
                                  setFieldDeathPlace(val);
                                }
                              ),
                            ])
                          )}

                          {/* 2. Individu concerné */}
                          {renderSection(actKind === "death" ? "Individu décédé" : "Individu concerné", [
                            renderFieldCard(
                              "name",
                              "Prénom(s) & Nom",
                              currentContext?.person?.displayName,
                              `${fieldGivenNames} ${fieldSurname}`.trim(),
                              (val) => {
                                const p = splitFullName(val);
                                setFieldGivenNames(p.given_names);
                                setFieldSurname(p.surname);
                              }
                            ),
                            renderFieldCard(
                              "occupation",
                              "Profession / Métier",
                              currentContext?.person?.occupation,
                              fieldOccupation,
                              setFieldOccupation
                            ),
                            actKind === "death" && fieldBirthDate ? renderFieldCard(
                              "birth_date",
                              "Date naissance déduite (selon âge au décès)",
                              currentContext?.person?.birth_date_raw,
                              fieldBirthDate,
                              setFieldBirthDate
                            ) : null,
                            actKind === "death" && fieldBirthPlace ? renderFieldCard(
                              "birth_place",
                              "Lieu de naissance",
                              currentContext?.person?.birth_place,
                              fieldBirthPlace,
                              setFieldBirthPlace
                            ) : null,
                            (actKind === "birth" && (fieldDeathDate || fieldDeathPlace)) ? renderFieldCard(
                              "death_date",
                              "Mention décès marginale",
                              currentContext?.person?.death_date_raw,
                              fieldDeathDate,
                              setFieldDeathDate
                            ) : null,
                            (actKind === "birth" && fieldDeathPlace) ? renderFieldCard(
                              "death_place",
                              "Lieu de décès marginal",
                              currentContext?.person?.death_place,
                              fieldDeathPlace,
                              setFieldDeathPlace
                            ) : null,
                          ])}

                          {/* 3. Parents */}
                          {renderSection("Filiation (Parents)", [
                            renderFieldCard(
                              "father",
                              "Père",
                              currentContext?.person?.father?.displayName,
                              fieldFather,
                              setFieldFather
                            ),
                            fieldFatherOccupation ? renderFieldCard(
                              "father_occupation",
                              "Métier du père",
                              currentContext?.person?.father?.occupation,
                              fieldFatherOccupation,
                              setFieldFatherOccupation
                            ) : null,
                            renderStatusCard(
                              "father_status",
                              "Statut père",
                              currentContext?.person?.father?.is_living === 0,
                              fatherIsDeceased,
                              setFatherIsDeceased
                            ),
                            fieldFatherBirthDate ? renderFieldCard(
                              "father_birth_date",
                              "Date naiss. père (déduite)",
                              currentContext?.person?.father?.birth_date_raw,
                              fieldFatherBirthDate,
                              setFieldFatherBirthDate
                            ) : null,
                            fieldFatherBirthPlace ? renderFieldCard(
                              "father_birth_place",
                              "Lieu naiss. père",
                              currentContext?.person?.father?.birth_place,
                              fieldFatherBirthPlace,
                              setFieldFatherBirthPlace
                            ) : null,
                            fieldFatherDeathDate ? renderFieldCard(
                              "father_death_date",
                              "Date décès père",
                              currentContext?.person?.father?.death_date_raw,
                              fieldFatherDeathDate,
                              setFieldFatherDeathDate
                            ) : null,
                            fieldFatherDeathPlace ? renderFieldCard(
                              "father_death_place",
                              "Lieu décès père",
                              currentContext?.person?.father?.death_place,
                              fieldFatherDeathPlace,
                              setFieldFatherDeathPlace
                            ) : null,
                            renderFieldCard(
                              "mother",
                              "Mère",
                              currentContext?.person?.mother?.displayName,
                              fieldMother,
                              setFieldMother
                            ),
                            fieldMotherOccupation ? renderFieldCard(
                              "mother_occupation",
                              "Métier de la mère",
                              currentContext?.person?.mother?.occupation,
                              fieldMotherOccupation,
                              setFieldMotherOccupation
                            ) : null,
                            renderStatusCard(
                              "mother_status",
                              "Statut mère",
                              currentContext?.person?.mother?.is_living === 0,
                              motherIsDeceased,
                              setMotherIsDeceased
                            ),
                            fieldMotherBirthDate ? renderFieldCard(
                              "mother_birth_date",
                              "Date naiss. mère (déduite)",
                              currentContext?.person?.mother?.birth_date_raw,
                              fieldMotherBirthDate,
                              setFieldMotherBirthDate
                            ) : null,
                            fieldMotherBirthPlace ? renderFieldCard(
                              "mother_birth_place",
                              "Lieu naiss. mère",
                              currentContext?.person?.mother?.birth_place,
                              fieldMotherBirthPlace,
                              setFieldMotherBirthPlace
                            ) : null,
                            fieldMotherDeathDate ? renderFieldCard(
                              "mother_death_date",
                              "Date décès mère",
                              currentContext?.person?.mother?.death_date_raw,
                              fieldMotherDeathDate,
                              setFieldMotherDeathDate
                            ) : null,
                            fieldMotherDeathPlace ? renderFieldCard(
                              "mother_death_place",
                              "Lieu décès mère",
                              currentContext?.person?.mother?.death_place,
                              fieldMotherDeathPlace,
                              setFieldMotherDeathPlace
                            ) : null,
                          ])}

                          {/* 4. Conjoint / Union éventuelle */}
                          {(fieldSpouse || fieldMarriageDate || fieldMarriagePlace) && (
                            renderSection("Conjoint / Union mentionnée", [
                              renderFieldCard(
                                "spouse",
                                "Conjoint(e)",
                                currentContext?.union?.partner2?.displayName,
                                fieldSpouse,
                                setFieldSpouse
                              ),
                              fieldMarriageDate ? renderFieldCard(
                                "marriage_date",
                                "Date mariage",
                                currentContext?.union?.date_raw,
                                fieldMarriageDate,
                                setFieldMarriageDate
                              ) : null,
                              fieldMarriagePlace ? renderFieldCard(
                                "marriage_place",
                                "Lieu mariage",
                                currentContext?.union?.place,
                                fieldMarriagePlace,
                                setFieldMarriagePlace
                              ) : null,
                            ])
                          )}
                        </div>
                      )}
                    </div>
                  );
                })()
              )}
            </div>

            {/* Pied de panneau fixe (Sticky Footer) pour la validation et l'enregistrement */}
            {sidebarTab === "compare" && slug && (personId || unionId) && (
              <div className="border-t border-border bg-surface p-3.5 shrink-0 flex flex-col gap-2.5 shadow-lg z-10">
                {saveSuccessMessage && (
                  <div className="rounded-xl bg-ok/10 border border-ok/30 p-2.5 text-center text-xs font-semibold text-ok animate-in fade-in">
                    {saveSuccessMessage}
                  </div>
                )}
                {saveErrorMessage && (
                  <div className="rounded-xl bg-danger/10 border border-danger/30 p-2.5 text-center text-xs font-semibold text-danger animate-in fade-in">
                    ⚠️ {saveErrorMessage}
                  </div>
                )}

                <label className="flex items-center gap-2 cursor-pointer text-xs text-fg select-none">
                  <input
                    type="checkbox"
                    checked={appendToNotes}
                    onChange={(e) => setAppendToNotes(e.target.checked)}
                    className="accent-fg rounded size-3.5"
                  />
                  <span>Conserver également la transcription intégrale dans les notes</span>
                </label>

                <button
                  type="button"
                  onClick={handleSaveToRecord}
                  disabled={pendingSave || selectedFieldKeys.size === 0}
                  className="w-full rounded-xl bg-fg py-2.5 px-3 text-xs font-semibold text-accent-fg hover:opacity-90 disabled:opacity-50 transition-opacity shadow-sm flex items-center justify-center gap-2 cursor-pointer"
                >
                  {pendingSave ? (
                    <>
                      <span className="inline-block size-3 rounded-full border-2 border-accent-fg border-t-transparent animate-spin" />
                      <span>Enregistrement dans la fiche…</span>
                    </>
                  ) : (
                    <span>
                      Valider et enregistrer {selectedFieldKeys.size > 0 ? `(${selectedFieldKeys.size} champ${selectedFieldKeys.size > 1 ? "s" : ""})` : ""}
                    </span>
                  )}
                </button>
              </div>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}
