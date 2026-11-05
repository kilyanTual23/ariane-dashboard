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
  IconAlert,
  IconArrowUpRight,
  IconBookOpen,
  IconCheck,
  IconCopy,
  IconDownload,
  IconExternalLink,
  IconFileText,
  IconMaximize,
  IconMinimize,
  IconMinus,
  IconMove,
  IconPlus,
  IconRotateCcw,
  IconRotateCw,
  IconScan,
  IconSparkles,
  IconX,
  Spinner,
} from "@/components/icons";
import { toggleNotebook, useNotebookOpen } from "@/components/Notebook";
import { buttonClass } from "@/components/ui";
import {
  parseTranscription,
  splitFullName,
  type ExtractedActData,
  type FieldSource,
} from "@/lib/transcription-parser";

const TOOL =
  "flex h-full min-w-7 items-center justify-center rounded-md text-fg-muted transition-colors hover:bg-surface hover:text-fg";
const TOOL_BORDERED =
  "flex size-8 items-center justify-center rounded-lg border border-border bg-surface text-fg-muted shadow-xs transition-colors hover:bg-surface-2 hover:text-fg";

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

/** Ouvre ou referme le carnet sans quitter la visionneuse. */
function NotebookButton({ compact = false }: { compact?: boolean }) {
  const open = useNotebookOpen();
  if (compact) {
    return (
      <button
        type="button"
        onClick={toggleNotebook}
        aria-pressed={open}
        aria-label={open ? "Replier le carnet" : "Ouvrir le carnet"}
        className={`flex size-9 items-center justify-center rounded-lg active:bg-surface-2 ${open ? "text-accent-text" : "text-fg-subtle"}`}
      >
        <IconBookOpen size={19} />
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={toggleNotebook}
      aria-pressed={open}
      className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium shadow-xs transition-colors ${
        open ? "border-accent/50 bg-accent-soft text-accent-text" : "border-border bg-surface text-fg hover:bg-surface-2"
      }`}
      title="Carnet (Ctrl .)"
    >
      <IconBookOpen size={14} />
      Carnet
    </button>
  );
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

  // Écran tactile : un doigt déplace, deux doigts zooment, un double toucher zoome ou revient à l'ensemble.
  const viewRef = useRef(view);
  useEffect(() => {
    viewRef.current = view;
  });

  useEffect(() => {
    if (!isOpen) return;
    const container = containerRef.current;
    if (!container) return;

    const rel = (t: Touch) => {
      const rect = container.getBoundingClientRect();
      return { x: t.clientX - (rect.left + rect.width / 2), y: t.clientY - (rect.top + rect.height / 2) };
    };
    let last: { x: number; y: number } | null = null;
    let pinch: { dist: number; mid: { x: number; y: number }; scale: number; pan: { x: number; y: number } } | null = null;
    let lastTap = 0;

    const onStart = (e: TouchEvent) => {
      if ((e.target as HTMLElement).closest("button, a, input, textarea")) return;
      e.preventDefault();
      if (e.touches.length === 2) {
        const a = rel(e.touches[0]);
        const b = rel(e.touches[1]);
        pinch = {
          dist: Math.hypot(a.x - b.x, a.y - b.y),
          mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
          scale: viewRef.current.scale,
          pan: viewRef.current.pan,
        };
        last = null;
        return;
      }
      const p = rel(e.touches[0]);
      last = p;
      const now = Date.now();
      if (now - lastTap < 280) {
        // Double toucher : zoom ×2,5 sous le doigt, ou retour à la vue d'ensemble si déjà zoomé.
        lastTap = 0;
        if (viewRef.current.scale > 1.2) {
          handleFit();
        } else {
          setView((prev) => {
            const scale = Math.min(10, prev.scale * 2.5);
            const f = scale / prev.scale;
            return { scale, pan: { x: p.x - (p.x - prev.pan.x) * f, y: p.y - (p.y - prev.pan.y) * f } };
          });
        }
      } else {
        lastTap = now;
      }
    };

    const onMove = (e: TouchEvent) => {
      e.preventDefault();
      if (pinch && e.touches.length >= 2) {
        const a = rel(e.touches[0]);
        const b = rel(e.touches[1]);
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const scale = Math.max(0.04, Math.min(10, (pinch.scale * dist) / Math.max(1, pinch.dist)));
        const f = scale / pinch.scale;
        const start = pinch;
        setView({ scale, pan: { x: mid.x - (start.mid.x - start.pan.x) * f, y: mid.y - (start.mid.y - start.pan.y) * f } });
        return;
      }
      if (last && e.touches.length === 1) {
        const p = rel(e.touches[0]);
        const dx = p.x - last.x;
        const dy = p.y - last.y;
        last = p;
        setView((prev) => ({ ...prev, pan: { x: prev.pan.x + dx, y: prev.pan.y + dy } }));
      }
    };

    const onEnd = (e: TouchEvent) => {
      pinch = null;
      last = e.touches.length === 1 ? rel(e.touches[0]) : null;
    };

    container.addEventListener("touchstart", onStart, { passive: false });
    container.addEventListener("touchmove", onMove, { passive: false });
    container.addEventListener("touchend", onEnd);
    container.addEventListener("touchcancel", onEnd);
    return () => {
      container.removeEventListener("touchstart", onStart);
      container.removeEventListener("touchmove", onMove);
      container.removeEventListener("touchend", onEnd);
      container.removeEventListener("touchcancel", onEnd);
    };
  }, [isOpen, handleFit]);

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
      className="fixed inset-0 z-50 flex animate-fade-in select-none flex-col bg-bg font-sans text-fg"
    >
      {/* Barre d'outils supérieure dans la DA sobre d'Ariane */}
      <header className="z-20 flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border bg-surface px-4 py-2 max-sm:gap-2 max-sm:pt-[calc(0.5rem+env(safe-area-inset-top))]">
        <div className="flex min-w-0 items-center gap-2.5 max-sm:w-full">
          <span className="max-w-xs truncate text-sm font-semibold text-fg sm:max-w-md">
            {title}
          </span>
          {naturalSize.width > 0 && (
            <span className="num hidden rounded-md bg-surface-2 px-1.5 py-0.5 text-2xs text-fg-subtle sm:inline-flex">
              {naturalSize.width} × {naturalSize.height} px
            </span>
          )}
          <span className="ml-auto sm:hidden">
            <NotebookButton compact />
          </span>
          <button
            type="button"
            onClick={onClose}
            className="flex size-9 shrink-0 items-center justify-center rounded-lg text-fg-subtle active:bg-surface-2 sm:hidden"
            aria-label="Fermer la visionneuse"
          >
            <IconX size={19} />
          </button>
        </div>

        {/* Contrôles du Viewer */}
        <div className="flex flex-wrap items-center gap-1.5 max-sm:-mx-4 max-sm:w-[calc(100%+2rem)] max-sm:flex-nowrap max-sm:overflow-x-auto max-sm:px-4 max-sm:pb-0.5 [&>*]:shrink-0">
          {/* Zoom */}
          <div className="flex h-8 items-center rounded-lg border border-border bg-surface-2/70 p-0.5">
            <button type="button" onClick={() => handleButtonZoom(1 / 1.25)} className={TOOL} title="Dézoomer (−)" aria-label="Dézoomer">
              <IconMinus size={14} />
            </button>
            <span className="num min-w-12 text-center text-xs font-medium text-fg">{Math.round(view.scale * 100)}%</span>
            <button type="button" onClick={() => handleButtonZoom(1.25)} className={TOOL} title="Zoomer (+)" aria-label="Zoomer">
              <IconPlus size={14} />
            </button>
            <span className="mx-0.5 h-4 w-px bg-border" />
            <button type="button" onClick={handleFit} className={`${TOOL} px-2 text-xs`} title="Ajuster à la fenêtre">
              Ajuster
            </button>
            <button
              type="button"
              onClick={handleActualSize}
              className={`${TOOL} px-2 text-xs ${Math.round(view.scale * 100) === 100 ? "bg-surface font-medium text-fg shadow-xs" : ""}`}
              title="Taille réelle (1:1)"
            >
              1:1
            </button>
          </div>

          {/* Rotation */}
          <div className="flex h-8 items-center rounded-lg border border-border bg-surface-2/70 p-0.5">
            <button type="button" onClick={handleRotateCCW} className={TOOL} title="Pivoter à gauche" aria-label="Pivoter à gauche">
              <IconRotateCcw size={14} />
            </button>
            <button type="button" onClick={handleRotateCW} className={TOOL} title="Pivoter à droite" aria-label="Pivoter à droite">
              <IconRotateCw size={14} />
            </button>
            {rotation !== 0 && <span className="num px-1.5 text-2xs text-fg-subtle">{rotation}°</span>}
          </div>

          {/* Filtres de lisibilité */}
          <div className="flex h-8 items-center rounded-lg border border-border bg-surface-2/70 p-0.5" role="group" aria-label="Filtres de lisibilité">
            <button
              type="button"
              aria-pressed={highContrast}
              onClick={() => setHighContrast((v) => !v)}
              className={`${TOOL} px-2 text-xs ${highContrast ? "bg-surface font-medium text-fg shadow-xs" : ""}`}
              title="Contraste renforcé"
            >
              Contraste
            </button>
            <button
              type="button"
              aria-pressed={invert}
              onClick={() => setInvert((v) => !v)}
              className={`${TOOL} px-2 text-xs ${invert ? "bg-surface font-medium text-fg shadow-xs" : ""}`}
              title="Inverser les couleurs : l’encre pâle ressort"
            >
              Négatif
            </button>
            <button
              type="button"
              aria-pressed={grayscale}
              onClick={() => setGrayscale((v) => !v)}
              className={`${TOOL} px-2 text-xs ${grayscale ? "bg-surface font-medium text-fg shadow-xs" : ""}`}
              title="Niveaux de gris"
            >
              N&amp;B
            </button>
          </div>

          <span className="mx-0.5 hidden h-5 w-px bg-border sm:inline" />

          {/* Carnet : noter en lisant l'acte (sur téléphone, il est dans la ligne du titre) */}
          <span className="max-sm:hidden">
            <NotebookButton />
          </span>

          {/* Transcription */}
          <button
            type="button"
            onClick={() => setOcrOpen((v) => !v)}
            aria-pressed={ocrOpen}
            className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-medium transition-colors ${
              ocrOpen ? "bg-accent text-accent-fg shadow-soft" : "border border-border bg-surface text-fg shadow-xs hover:bg-surface-2"
            }`}
            title="Transcrire l’acte et reporter les informations dans la fiche"
          >
            <IconSparkles size={14} />
            Transcrire
          </button>

          <button type="button" onClick={toggleFullscreen} className={`${TOOL_BORDERED} max-sm:hidden`} title="Plein écran" aria-label="Plein écran">
            {isFullscreen ? <IconMinimize size={14} /> : <IconMaximize size={14} />}
          </button>

          {originalUrl && (
            <a
              href={originalUrl}
              target="_blank"
              rel="noreferrer"
              className={TOOL_BORDERED}
              title="Ouvrir sur le site des archives"
              aria-label="Ouvrir sur le site des archives"
            >
              <IconExternalLink size={14} />
            </a>
          )}

          <a href={imageUrl} download={downloadFilename ?? "acte.jpg"} className={TOOL_BORDERED} title="Télécharger l’image" aria-label="Télécharger l’image">
            <IconDownload size={14} />
          </a>

          <button
            type="button"
            onClick={onClose}
            className="ml-1 flex size-8 items-center justify-center rounded-lg text-fg-subtle transition-colors hover:bg-surface-2 hover:text-fg max-sm:hidden"
            title="Fermer (Échap)"
            aria-label="Fermer la visionneuse"
          >
            <IconX size={17} />
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
          className={`relative h-full w-full flex-1 touch-none overflow-hidden bg-surface-2/70 ${
            mode === "select"
              ? "cursor-crosshair"
              : isDragging
                ? "cursor-grabbing"
                : "cursor-grab"
          }`}
        >
          {loading && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-surface-2/80">
              <Spinner size={20} className="text-fg-muted" />
              <span className="text-ui text-fg-muted">Chargement de l’acte…</span>
            </div>
          )}

          {loadError && !loading && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-surface p-6 text-center">
              <IconFileText size={28} className="mb-3 text-fg-subtle" />
              <p className="text-sm font-semibold text-fg">{loadError}</p>
              <p className="mt-1.5 max-w-md text-xs text-fg-muted">
                Le document n’a pas pu être affiché ici. S’il est sur Google Drive, vérifiez qu’il est partagé avec
                « Tous les utilisateurs disposant du lien ».
              </p>
              {originalUrl && (
                <a href={originalUrl} target="_blank" rel="noreferrer" className={buttonClass("primary", "mt-4")}>
                  Ouvrir l’original
                  <IconExternalLink size={13} />
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

          {/* Cadre de la zone à transcrire */}
          {screenCrop && (
            <div
              style={{
                left: screenCrop.left,
                top: screenCrop.top,
                width: screenCrop.width,
                height: screenCrop.height,
              }}
              className="pointer-events-none absolute rounded-sm border-2 border-info-dot bg-info-dot/10"
            >
              <span className="num absolute -top-6 left-0 rounded-md bg-info-dot px-1.5 py-0.5 text-2xs font-medium text-white shadow-xs">
                {cropBox?.width} × {cropBox?.height} px
              </span>
            </div>
          )}


          {/* Outils de la page : déplacer l'image ou tracer une zone à transcrire */}
          <div className="absolute bottom-4 left-4 z-10 flex h-9 items-center gap-0.5 rounded-xl border border-border bg-surface/95 p-1 shadow-card backdrop-blur">
            <button
              type="button"
              onClick={() => setMode("pan")}
              aria-pressed={mode === "pan"}
              title="Déplacer l’image en la faisant glisser"
              className={`flex h-full items-center gap-1.5 rounded-lg px-2.5 text-xs transition-colors ${
                mode === "pan" ? "bg-surface-2 font-medium text-fg" : "text-fg-muted hover:text-fg"
              }`}
            >
              <IconMove size={13} />
              Déplacer
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("select");
                if (!ocrOpen) setOcrOpen(true);
              }}
              aria-pressed={mode === "select"}
              title="Tracer un cadre autour de l’acte à transcrire"
              className={`flex h-full items-center gap-1.5 rounded-lg px-2.5 text-xs transition-colors ${
                mode === "select" ? "bg-surface-2 font-medium text-fg" : "text-fg-muted hover:text-fg"
              }`}
            >
              <IconScan size={13} />
              Tracer une zone
            </button>
            {cropBox && cropBox.width > 0 && (
              <button
                type="button"
                onClick={() => setCropBox(null)}
                className="flex h-full items-center gap-1 rounded-lg px-2 text-xs text-fg-subtle transition-colors hover:text-fg"
                title="Effacer la zone"
              >
                <IconX size={12} />
                Effacer
              </button>
            )}
          </div>
        </main>

        {/* Panneau latéral : report dans la fiche, texte transcrit, réglages */}
        {ocrOpen && (
          <aside className="z-20 flex w-[min(40rem,94vw)] shrink-0 animate-slide-in-right flex-col border-l border-border bg-surface">
            <div className="flex shrink-0 items-center gap-1 border-b border-border px-3">
              {transcription ? (
                <nav className="flex items-center gap-0.5" aria-label="Panneau de transcription">
                  {(
                    [
                      ["compare", "Reporter dans la fiche"],
                      ["transcription", "Texte"],
                      ["settings", "Réglages"],
                    ] as const
                  ).map(([tab, label]) => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setSidebarTab(tab)}
                      aria-current={sidebarTab === tab ? "page" : undefined}
                      className={`relative flex h-11 items-center gap-1.5 px-2.5 text-ui transition-colors ${
                        sidebarTab === tab
                          ? "font-medium text-fg after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full after:bg-accent"
                          : "text-fg-muted hover:text-fg"
                      }`}
                    >
                      {label}
                      {tab === "compare" && selectedFieldKeys.size > 0 && (
                        <span className="num rounded-full bg-accent px-1.5 text-[0.625rem] font-semibold leading-4 text-accent-fg">
                          {selectedFieldKeys.size}
                        </span>
                      )}
                    </button>
                  ))}
                </nav>
              ) : (
                <h3 className="flex h-11 items-center gap-2 px-1.5 text-ui font-semibold">
                  <IconSparkles size={14} className="text-fg-subtle" />
                  Transcrire l’acte
                </h3>
              )}
              <button
                type="button"
                onClick={() => setOcrOpen(false)}
                className="ml-auto flex size-7 items-center justify-center rounded-md text-fg-subtle transition-colors hover:bg-surface-2 hover:text-fg"
                title="Fermer le panneau"
                aria-label="Fermer le panneau"
              >
                <IconX size={15} />
              </button>
            </div>

            {/* Corps du panneau défilant */}
            <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-5 text-ui">
              {ocrLoading ? (
                <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
                  <Spinner size={22} className="text-fg-muted" />
                  <div>
                    <p className="text-sm font-medium text-fg">{ocrProgress || `Analyse en cours… ${ocrElapsed} s`}</p>
                    <p className="mx-auto mt-1 max-w-xs text-xs text-fg-muted">
                      {ocrEngine === "gemini"
                        ? "L’IA paléographe déchiffre l’écriture et repère les informations généalogiques."
                        : "Tesseract reconnaît les caractères du document."}
                    </p>
                  </div>
                  <button type="button" onClick={handleCancelOcr} className={buttonClass("secondary", "", "sm")}>
                    Annuler l’analyse
                  </button>
                </div>
              ) : sidebarTab === "settings" || !transcription ? (
                <div className="flex flex-col gap-6">
                  <section>
                    <h4 className="text-ui font-semibold">Zone à transcrire</h4>
                    {cropBox && cropBox.width > 20 && cropBox.height > 20 ? (
                      <div className="mt-2 flex items-center justify-between gap-3 rounded-lg bg-surface-2 px-3 py-2">
                        <span className="flex items-center gap-2 text-fg">
                          <IconScan size={14} className="text-fg-subtle" />
                          Zone tracée
                          <span className="num text-xs text-fg-subtle">
                            {cropBox.width} × {cropBox.height} px
                          </span>
                        </span>
                        <button type="button" onClick={() => setCropBox(null)} className={buttonClass("quiet", "", "xs")}>
                          Toute la page
                        </button>
                      </div>
                    ) : (
                      <div className="mt-1.5 flex flex-col items-start gap-2.5">
                        <p className="text-xs text-fg-muted">
                          Toute la page sera lue. Sur un registre à plusieurs actes, tracez un cadre autour de celui qui
                          vous intéresse : la lecture est plus fiable.
                        </p>
                        <button type="button" onClick={() => setMode("select")} className={buttonClass("secondary", "", "sm")}>
                          <IconScan size={13} />
                          Tracer une zone
                        </button>
                      </div>
                    )}
                  </section>

                  <section>
                    <h4 className="text-ui font-semibold">Moteur de lecture</h4>
                    <div
                      className="mt-2 divide-y divide-border overflow-hidden rounded-lg border border-border"
                      role="radiogroup"
                      aria-label="Moteur de transcription"
                    >
                      {(
                        [
                          ["gemini", "IA paléographe", "Écritures manuscrites anciennes, du XVIe au XXe siècle. Nécessite une clé."],
                          ["tesseract", "Tesseract, en local", "Sans clé ni connexion. Pour les imprimés, tables décennales et formulaires."],
                        ] as const
                      ).map(([engine, title, hint]) => (
                        <label
                          key={engine}
                          className={`flex cursor-pointer items-start gap-3 px-3 py-2.5 transition-colors ${
                            ocrEngine === engine ? "bg-surface-2/70" : "hover:bg-surface-2/40"
                          }`}
                        >
                          <input
                            type="radio"
                            name="ocrEngine"
                            checked={ocrEngine === engine}
                            onChange={() => setOcrEngine(engine)}
                            className="mt-0.5 accent-[var(--fg)]"
                          />
                          <span>
                            <span className="block text-ui font-medium text-fg">{title}</span>
                            <span className="block text-xs text-fg-muted">{hint}</span>
                          </span>
                        </label>
                      ))}
                    </div>
                    {ocrEngine === "gemini" && (
                      <label className="mt-4 block">
                        <span className="label flex items-center justify-between gap-2">
                          Clé d’accès (Gemini, Groq ou OpenAI)
                          {geminiApiKey && (
                            <span className="flex items-center gap-1 font-normal text-ok">
                              <IconCheck size={12} />
                              Enregistrée sur cet appareil
                            </span>
                          )}
                        </span>
                        <input
                          type="password"
                          value={geminiApiKey}
                          onChange={(e) => handleSaveGeminiKey(e.target.value)}
                          placeholder="AIza…, gsk_… ou sk-…"
                          autoComplete="off"
                          className="field"
                        />
                        <span className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                          <a
                            href="https://aistudio.google.com/apikey"
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-fg-muted underline-offset-4 hover:text-fg hover:underline"
                          >
                            Obtenir une clé Google AI Studio
                            <IconArrowUpRight size={11} />
                          </a>
                          <a
                            href="https://console.groq.com/keys"
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-fg-muted underline-offset-4 hover:text-fg hover:underline"
                          >
                            Alternative gratuite : Groq
                            <IconArrowUpRight size={11} />
                          </a>
                        </span>
                      </label>
                    )}
                  </section>

                  <button type="button" onClick={handleRunOcr} className={buttonClass("primary", "w-full", "lg")}>
                    <IconSparkles size={15} />
                    {transcription ? "Relancer l’analyse" : "Lancer la transcription"}
                  </button>
                </div>
              ) : sidebarTab === "transcription" ? (
                /* Onglet 2 : texte transcrit */
                <div className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex h-7 items-center rounded-lg border border-border bg-surface-2/70 p-0.5" role="radiogroup" aria-label="Mode">
                      {(
                        [
                          [false, "Lecture"],
                          [true, "Correction"],
                        ] as const
                      ).map(([value, label]) => (
                        <button
                          key={label}
                          type="button"
                          role="radio"
                          aria-checked={editMode === value}
                          onClick={() => setEditMode(value)}
                          className={`h-full rounded-md px-2.5 text-xs transition-colors ${
                            editMode === value ? "bg-surface font-medium text-fg shadow-xs" : "text-fg-muted hover:text-fg"
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <div className="ml-auto flex items-center gap-1.5">
                      <button type="button" onClick={handleCopyTranscription} className={buttonClass("secondary", "", "sm")}>
                        {copySuccess ? <IconCheck size={13} /> : <IconCopy size={13} />}
                        {copySuccess ? "Copié" : "Copier"}
                      </button>
                      {slug && (personId || unionId) && (
                        <button
                          type="button"
                          onClick={handleSaveToNotes}
                          disabled={pendingSave}
                          className={buttonClass("secondary", "", "sm")}
                        >
                          {saveSuccess ? <IconCheck size={13} /> : <IconFileText size={13} />}
                          {saveSuccess ? "Ajouté aux notes" : "Ajouter aux notes"}
                        </button>
                      )}
                    </div>
                  </div>

                  {pinnedSourceKey && getSourceForField(pinnedSourceKey)?.text && (
                    <div className="flex items-start gap-2 rounded-lg bg-warn-soft px-3 py-2 text-xs">
                      <span className="shrink-0 font-medium text-warn">{getFieldLabel(pinnedSourceKey)}</span>
                      <span className="min-w-0 flex-1 italic text-fg">« {getSourceForField(pinnedSourceKey)!.text} »</span>
                      <button
                        type="button"
                        onClick={() => setPinnedSourceKey(null)}
                        className="shrink-0 text-fg-subtle transition-colors hover:text-fg"
                        title="Retirer le surlignage"
                        aria-label="Retirer le surlignage"
                      >
                        <IconX size={13} />
                      </button>
                    </div>
                  )}

                  {editMode ? (
                    <textarea
                      rows={18}
                      value={transcription}
                      onChange={(e) => setTranscription(e.target.value)}
                      placeholder="La transcription s’affiche ici…"
                      className="field min-h-[22rem] resize-y font-mono text-xs leading-relaxed"
                    />
                  ) : (() => {
                    const activeQuote = pinnedSourceKey ? getSourceForField(pinnedSourceKey)?.text?.trim() : undefined;
                    if (activeQuote && transcription.toLowerCase().includes(activeQuote.toLowerCase())) {
                      const idx = transcription.toLowerCase().indexOf(activeQuote.toLowerCase());
                      const before = transcription.slice(0, idx);
                      const match = transcription.slice(idx, idx + activeQuote.length);
                      const after = transcription.slice(idx + activeQuote.length);
                      return (
                        <div className="whitespace-pre-wrap text-sm leading-relaxed text-fg">
                          <span>{before}</span>
                          <mark className="rounded bg-warn-soft px-0.5 font-medium text-fg ring-1 ring-warn-dot/60">{match}</mark>
                          <span>{after}</span>
                        </div>
                      );
                    }
                    return (
                      <div className="text-sm leading-relaxed text-fg">
                        <ReactMarkdown
                          components={{
                            h1: ({ ...props }) => <h4 className="mb-1.5 mt-4 text-sm font-semibold text-fg first:mt-0" {...props} />,
                            h2: ({ ...props }) => <h4 className="mb-1.5 mt-4 text-sm font-semibold text-fg first:mt-0" {...props} />,
                            h3: ({ ...props }) => (
                              <h4 className="mb-1 mt-4 border-b border-border pb-1 text-ui font-semibold text-fg first:mt-0" {...props} />
                            ),
                            p: ({ ...props }) => <p className="my-2 text-fg" {...props} />,
                            ul: ({ ...props }) => <ul className="my-2 list-disc space-y-1 pl-5 text-fg-muted" {...props} />,
                            ol: ({ ...props }) => <ol className="my-2 list-decimal space-y-1 pl-5 text-fg-muted" {...props} />,
                            li: ({ ...props }) => <li {...props} />,
                            strong: ({ ...props }) => <strong className="font-semibold text-fg" {...props} />,
                            blockquote: ({ ...props }) => (
                              <blockquote className="my-2 border-l-2 border-border-strong pl-3 italic text-fg-muted" {...props} />
                            ),
                          }}
                        >
                          {transcription}
                        </ReactMarkdown>
                      </div>
                    );
                  })()}

                  <p className="text-xs text-fg-subtle">
                    {editMode
                      ? "Corrigez le texte, puis « Ré-analyser » dans l’onglet Reporter dans la fiche pour mettre les champs à jour."
                      : "Un mot mal lu ? Passez en mode Correction."}
                  </p>
                </div>
              ) : (
                /* Onglet 3 : Vue comparative Avant / Après entièrement remodelée */
                (() => {
                  if (!slug || (!personId && !unionId)) {
                    return (
                      <div className="flex flex-col items-center gap-1.5 py-12 text-center">
                        <p className="text-ui font-medium text-fg">Visionneuse isolée</p>
                        <p className="max-w-sm text-xs text-fg-muted">
                          Ouvrez l’acte depuis une fiche pour comparer ce qui a été lu avec la fiche et le reporter en un
                          clic.
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

                  // Une ligne par champ : case à cocher, intitulé, valeur de la fiche, valeur lue.
                  const COLS =
                    "grid grid-cols-[1rem_minmax(6rem,8.5rem)_minmax(0,1fr)_minmax(0,1.2fr)] items-center gap-x-3";

                  const statusTag = (state: "new" | "modified" | "same" | "empty") =>
                    state === "new" ? (
                      <span className="shrink-0 text-2xs font-medium text-ok" title="Absent de la fiche">
                        Nouveau
                      </span>
                    ) : state === "modified" ? (
                      <span className="shrink-0 text-2xs font-medium text-warn" title="Différent de la fiche">
                        Modifié
                      </span>
                    ) : state === "same" ? (
                      <span className="shrink-0 text-2xs text-fg-subtle">Identique</span>
                    ) : null;

                  const sourceLine = (key: string, text?: string | null) =>
                    text ? (
                      <button
                        type="button"
                        onClick={() => handleToggleSource(key)}
                        title="Surligner ce passage dans le texte"
                        className={`mt-1 block max-w-full truncate pl-7 text-left text-2xs italic transition-colors ${
                          pinnedSourceKey === key ? "text-warn" : "text-fg-subtle hover:text-fg-muted"
                        }`}
                      >
                        « {text} »
                      </button>
                    ) : null;

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
                    const isDiff = isNew || isModified;
                    const isChecked = selectedFieldKeys.has(key);
                    const src = getSourceForField(key);

                    if (filterMode === "changes" && !isDiff && !isChecked) {
                      return null;
                    }

                    return (
                      <div
                        key={key}
                        className={`-mx-2 border-b border-border px-2 py-2 transition-colors last:border-b-0 ${
                          isChecked ? "bg-surface-2/70" : ""
                        }`}
                      >
                        <div className={COLS}>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleFieldKey(key)}
                            disabled={isEmpty}
                            aria-label={`Reporter : ${label}`}
                            className="size-3.5 accent-[var(--fg)] disabled:opacity-30"
                          />
                          <span className="truncate text-xs text-fg-muted" title={label}>
                            {label}
                          </span>
                          <span className="truncate text-xs" title={currentVal || "Non renseigné"}>
                            {currentVal ? <span className="text-fg">{currentVal}</span> : <span className="text-fg-subtle">—</span>}
                          </span>
                          <span className="flex min-w-0 items-center gap-2">
                            <input
                              type="text"
                              value={proposedVal}
                              onChange={(e) => onChangeProposed(e.target.value)}
                              placeholder={placeholder || "Non lu"}
                              aria-label={`${label} lu dans l’acte`}
                              className={`h-7 w-full min-w-0 rounded-md border border-transparent px-2 text-xs outline-none transition-colors placeholder:text-fg-subtle hover:border-border focus:border-border-strong focus:bg-surface ${
                                isNew
                                  ? "bg-ok-soft/70 font-medium text-fg"
                                  : isModified
                                    ? "bg-warn-soft/70 font-medium text-fg"
                                    : "bg-transparent text-fg-muted"
                              }`}
                            />
                            {statusTag(isNew ? "new" : isModified ? "modified" : isEmpty ? "empty" : "same")}
                          </span>
                        </div>
                        {sourceLine(key, src?.text)}
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
                        className={`-mx-2 border-b border-border px-2 py-2 transition-colors last:border-b-0 ${
                          isChecked ? "bg-surface-2/70" : ""
                        }`}
                      >
                        <div className={COLS}>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleFieldKey(key)}
                            aria-label={`Reporter : ${label}`}
                            className="size-3.5 accent-[var(--fg)]"
                          />
                          <span className="truncate text-xs text-fg-muted" title={label}>
                            {label}
                          </span>
                          <span className="truncate text-xs">
                            {currentDeceased ? (
                              <span className="text-fg">Décédé(e)</span>
                            ) : (
                              <span className="text-fg-subtle">Vivant(e) ou inconnu</span>
                            )}
                          </span>
                          <span className="flex min-w-0 items-center gap-2">
                            <label className="flex h-7 min-w-0 flex-1 cursor-pointer items-center gap-2 px-2 text-xs">
                              <input
                                type="checkbox"
                                checked={proposedDeceased}
                                onChange={(e) => onToggleDeceased(e.target.checked)}
                                className="size-3.5 accent-[var(--fg)]"
                              />
                              <span className={`truncate ${proposedDeceased ? "font-medium text-fg" : "text-fg-muted"}`}>
                                {proposedDeceased ? "Décédé(e) lors de l’acte" : "Vivant(e) lors de l’acte"}
                              </span>
                            </label>
                            {statusTag(isDiff ? "modified" : "same")}
                          </span>
                        </div>
                        {sourceLine(key, src?.text)}
                      </div>
                    );
                  };

                  const renderSection = (title: string, children: React.ReactNode[]) => {
                    const validChildren = children.filter(Boolean);
                    if (validChildren.length === 0) return null;

                    return (
                      <section key={title} className="pt-5 first:pt-1">
                        <h5 className="flex items-center justify-between pb-1 text-xs font-semibold text-fg">
                          {title}
                          <span className="num font-normal text-fg-subtle">{validChildren.length}</span>
                        </h5>
                        <div className="border-t border-border">{validChildren}</div>
                      </section>
                    );
                  };

                  return (
                    <div className="flex flex-col gap-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <div
                          className="flex h-7 items-center rounded-lg border border-border bg-surface-2/70 p-0.5"
                          role="radiogroup"
                          aria-label="Champs affichés"
                        >
                          {(
                            [
                              ["changes", `Différences (${totalChangesCount})`],
                              ["all", `Tout (${allAvailableKeys.length})`],
                            ] as const
                          ).map(([value, label]) => (
                            <button
                              key={value}
                              type="button"
                              role="radio"
                              aria-checked={filterMode === value}
                              onClick={() => setFilterMode(value)}
                              className={`h-full rounded-md px-2.5 text-xs transition-colors ${
                                filterMode === value ? "bg-surface font-medium text-fg shadow-xs" : "text-fg-muted hover:text-fg"
                              }`}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                        <div className="ml-auto flex items-center gap-0.5">
                          <button type="button" onClick={() => selectAllKeys(allAvailableKeys)} className={buttonClass("quiet", "", "xs")}>
                            Tout cocher
                          </button>
                          <button type="button" onClick={deselectAllKeys} className={buttonClass("quiet", "", "xs")}>
                            Aucun
                          </button>
                          <button
                            type="button"
                            onClick={handleSyncFromTranscription}
                            className={buttonClass("quiet", "", "xs")}
                            title="Relire le texte transcrit pour remplir les champs"
                          >
                            <IconRotateCw size={11} />
                            Ré-analyser
                          </button>
                        </div>
                      </div>
                      <p className="-mt-1 text-xs text-fg-muted">
                        Cochez ce qui doit être reporté ; les valeurs lues restent modifiables avant l’enregistrement.
                      </p>

                      {filterMode === "changes" && totalChangesCount === 0 ? (
                        <div className="rounded-lg bg-surface-2 px-4 py-6 text-center">
                          <p className="text-ui font-medium text-fg">Rien de nouveau dans cet acte</p>
                          <p className="mt-1 text-xs text-fg-muted">
                            La fiche contient déjà ces informations. Affichez « Tout » pour forcer une valeur.
                          </p>
                        </div>
                      ) : (
                        <div className={`${COLS} -mb-2 pt-1 text-2xs font-medium text-fg-subtle`}>
                          <span />
                          <span>Champ</span>
                          <span>Dans la fiche</span>
                          <span>Lu dans l’acte</span>
                        </div>
                      )}

                      {/* Sections structurées en cartes claires */}
                      {isMarriage ? (
                        <div className="flex flex-col">
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
                        <div className="flex flex-col">
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

            {/* Pied fixe : report des champs cochés dans la fiche */}
            {sidebarTab === "compare" && transcription && !ocrLoading && slug && (personId || unionId) && (
              <div className="flex shrink-0 flex-col gap-2.5 border-t border-border bg-surface px-5 py-3.5">
                {saveSuccessMessage && (
                  <p className="flex items-center gap-2 rounded-lg bg-ok-soft px-3 py-2 text-xs font-medium text-ok">
                    <IconCheck size={13} />
                    {saveSuccessMessage.replace(/^✓\s*/, "")}
                  </p>
                )}
                {saveErrorMessage && (
                  <p className="flex items-center gap-2 rounded-lg bg-danger-soft px-3 py-2 text-xs font-medium text-danger">
                    <IconAlert size={13} />
                    {saveErrorMessage}
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-3">
                  <label className="flex cursor-pointer select-none items-center gap-2 text-xs text-fg-muted">
                    <input
                      type="checkbox"
                      checked={appendToNotes}
                      onChange={(e) => setAppendToNotes(e.target.checked)}
                      className="size-3.5 accent-[var(--fg)]"
                    />
                    Joindre le texte complet aux notes
                  </label>
                  <button
                    type="button"
                    onClick={handleSaveToRecord}
                    disabled={pendingSave || selectedFieldKeys.size === 0}
                    className={buttonClass("primary", "ml-auto min-w-48")}
                  >
                    {pendingSave ? (
                      <>
                        <Spinner size={13} />
                        Enregistrement…
                      </>
                    ) : selectedFieldKeys.size > 0 ? (
                      `Reporter ${selectedFieldKeys.size} champ${selectedFieldKeys.size > 1 ? "s" : ""} dans la fiche`
                    ) : (
                      "Cochez des champs à reporter"
                    )}
                  </button>
                </div>
              </div>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}
