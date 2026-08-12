import { Capacitor } from '@capacitor/core'
import { NativeBiometric, BiometryType } from '@capgo/capacitor-native-biometric'

export function typeBiometrieNom(type) {
  switch (type) {
    case BiometryType.FACE_ID:
    case BiometryType.FACE_AUTHENTICATION:
      return 'le visage'
    case BiometryType.TOUCH_ID:
    case BiometryType.FINGERPRINT:
      return 'l\u2019empreinte'
    default:
      return 'la biométrie'
  }
}

export async function biometrieDisponible() {
  if (!Capacitor.isNativePlatform()) return { disponible: false, type: null, typeNom: '' }
  try {
    const res = await NativeBiometric.isAvailable()
    return { disponible: !!res.isAvailable, type: res.biometryType, typeNom: typeBiometrieNom(res.biometryType) }
  } catch {
    return { disponible: false, type: null, typeNom: '' }
  }
}

export async function verifierBiometrie() {
  if (!Capacitor.isNativePlatform()) return false
  try {
    await NativeBiometric.verifyIdentity({
      reason: 'Déverrouillez Tontine Manager',
      title: 'Déverrouillage biométrique',
      subtitle: 'Utilisez votre empreinte ou votre visage',
      description: 'Confirmez votre identité pour accéder à vos tontines.',
      negativeButtonText: 'Annuler',
    })
    return true
  } catch {
    return false
  }
}
