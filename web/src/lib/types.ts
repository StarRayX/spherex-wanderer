// Shape of web/public/showcase/<slug>/meta.json, written by pipeline/blink/render.py and build.py.
// Only the fields the UI reads are typed; everything optional is optional on purpose.

export type XY = [number, number]

export interface Visit {
  file: string
  date: string
  mjd: number
  band: string
  wavelength_um: number
  wavelength_min_um: number
  wavelength_max_um: number
  star_xy: XY | null
  predicted_xy: XY
  flags_summary?: string
}

export interface Motion {
  measured_arcsec_per_yr: number
  error_arcsec_per_yr: number
  gaia_arcsec_per_yr: number
  axis: 'ra' | 'dec'
  parallax_corrected?: { measured_arcsec_per_yr: number; error_arcsec_per_yr: number }
}

export interface Difference {
  file: string | null
  visits: [number, number]
  dates: [string, string]
  wave_a_um: number
  wave_b_um: number
  skipped: string | null
  note?: string
}

export interface Spectrum {
  wavelength_um: number[]
  flux_mjy: number[]
  err_mjy: number[]
  n_used: number
  visit_date: string
  validation: string
  caveats: string[]
}

export interface PhotometryPoint {
  date: string
  aperture_mjy: number | null
  error_mjy: number | null
  wavelength_min_um: number
  wavelength_max_um: number
  lower_limit?: boolean
}

export interface Astrometry {
  ra: number
  dec: number
  pmra: number // mas/yr
  pmdec: number // mas/yr
  parallax: number // mas
  epoch_from: number
}

export interface Meta {
  slug: string
  pixel_scale_arcsec: number
  upsample: number
  size_arcmin: number
  visits: Visit[]
  motion: Motion | null
  detected?: boolean[]
  photometry?: PhotometryPoint[] | Record<string, unknown> | null
  notes?: string[]
  differences?: Difference[]
  spectrum?: Spectrum | null
  spectrum_reason?: string | null
  target?: { name: string; claim: string; astrometry?: Astrometry; astrometry_source?: string }
}
