/**
 * Nom et durée du cookie de session. Fichier à part, sans dépendance :
 * le proxy l'importe pour un contrôle rapide (présence du cookie) sans charger la base.
 */
export const SESSION_COOKIE = "ariane_auth";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 jours

/** Ancien cookie (mot de passe unique), effacé à la connexion. */
export const LEGACY_COOKIE = "ariane_session";
