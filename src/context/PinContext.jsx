import { createContext, useContext, useEffect, useState } from 'react'
import { getSettings, saveSettings } from '../lib/format'
import { makePinRecord, verifyPin } from '../lib/pin'
import { genererSecretTotp, verifierCodeTotp } from '../lib/totp'

const PinContext = createContext(null)

export function PinProvider({ children }) {
  const [pinActive, setPinActive] = useState(false)
  const [totpActive, setTotpActive] = useState(false)
  const [biometrieActive, setBiometrieActive] = useState(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const s = getSettings()
    setPinActive(!!s.pinActive)
    setTotpActive(!!s.totpActive)
    setBiometrieActive(!!s.biometrieActive)
    setReady(!s.pinActive)
  }, [])

  const activerPin = async (pin) => {
    const record = await makePinRecord(pin)
    if (!saveSettings({ pinActive: true, pinHash: record.hash, pinSalt: record.salt })) return false
    setPinActive(true)
    setReady(true)
    return true
  }

  const desactiverPin = async (pin) => {
    const s = getSettings()
    const ok = await verifyPin(pin, s.pinSalt, s.pinHash)
    if (!ok) return false
    if (!saveSettings({ pinActive: false, pinHash: null, pinSalt: null, totpActive: false, totpSecret: null, biometrieActive: false })) return false
    setPinActive(false)
    setTotpActive(false)
    setBiometrieActive(false)
    setReady(true)
    return true
  }

  const activerBiometrie = () => {
    if (!saveSettings({ biometrieActive: true })) return false
    setBiometrieActive(true)
    return true
  }

  const desactiverBiometrie = () => {
    if (!saveSettings({ biometrieActive: false })) return false
    setBiometrieActive(false)
    return true
  }

  const verifierPin = async (pin) => {
    const s = getSettings()
    const ok = await verifyPin(pin, s.pinSalt, s.pinHash)
    if (ok && !s.totpActive) setReady(true)
    return ok
  }

  const changerPin = async (ancien, nouveau) => {
    const s = getSettings()
    const ok = await verifyPin(ancien, s.pinSalt, s.pinHash)
    if (!ok) return false
    const record = await makePinRecord(nouveau)
    if (!saveSettings({ pinHash: record.hash, pinSalt: record.salt })) return false
    return true
  }

  const preparerTotp = () => {
    const secret = genererSecretTotp()
    if (!saveSettings({ totpSecret: secret })) return null
    setTotpActive(false)
    return secret
  }

  const activerTotp = async (code) => {
    const s = getSettings()
    if (!s.totpSecret) return false
    const ok = await verifierCodeTotp(s.totpSecret, code)
    if (!ok) return false
    if (!saveSettings({ totpActive: true })) return false
    setTotpActive(true)
    return true
  }

  const desactiverTotp = async (code) => {
    const s = getSettings()
    if (!s.totpSecret) return false
    const ok = await verifierCodeTotp(s.totpSecret, code)
    if (!ok) return false
    if (!saveSettings({ totpActive: false, totpSecret: null })) return false
    setTotpActive(false)
    return true
  }

  const verifierTotp = async (code) => {
    const s = getSettings()
    const ok = await verifierCodeTotp(s.totpSecret, code)
    if (ok) setReady(true)
    return ok
  }

  const verrouiller = () => setReady(false)
  const passer = () => setReady(true)

  return (
    <PinContext.Provider
      value={{
        pinActive,
        totpActive,
        biometrieActive,
        ready,
        activerPin,
        desactiverPin,
        verifierPin,
        changerPin,
        activerBiometrie,
        desactiverBiometrie,
        preparerTotp,
        activerTotp,
        desactiverTotp,
        verifierTotp,
        verrouiller,
        passer,
      }}
    >
      {children}
    </PinContext.Provider>
  )
}

export const usePin = () => useContext(PinContext)
