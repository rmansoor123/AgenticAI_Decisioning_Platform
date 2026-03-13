import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'

export function useSellers() {
  const [sellers, setSellers] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchParams] = useSearchParams()
  const urlSellerId = searchParams.get('sellerId') || ''

  useEffect(() => {
    let cancelled = false
    fetch('/api/onboarding/sellers?limit=200')
      .then(r => r.json())
      .then(json => {
        if (!cancelled && json.success && json.data) {
          setSellers(json.data.map(s => ({
            sellerId: s.sellerId,
            name: s.businessName || s.sellerId,
            risk: s.riskTier || 'unknown'
          })))
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  return { sellers, loading, urlSellerId }
}
