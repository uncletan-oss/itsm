/** Bagan akun (Chart of Accounts) ringkas untuk akuntansi TI. Sesuaikan dengan COA perusahaan. */
export const ACCOUNTS = [
  ['1100', 'Kas & Bank'],
  ['1300', 'Aset Tetap TI — Perangkat Keras'],
  ['1310', 'Aset Tak Berwujud — Lisensi Perangkat Lunak'],
  ['1400', 'Biaya Dibayar Dimuka'],
  ['1500', 'PPN Masukan'],
  ['2100', 'Utang Usaha (Accounts Payable)'],
  ['5100', 'Beban Pemeliharaan TI'],
  ['5110', 'Beban Lisensi & Langganan'],
  ['5120', 'Beban Cloud & Hosting'],
  ['5130', 'Beban Jasa Konsultan TI'],
  ['5140', 'Beban Telekomunikasi'],
  ['5900', 'Beban TI Lainnya'],
];
export const ACCOUNT_NAME = Object.fromEntries(ACCOUNTS);
export const DEFAULT_TAX_RATE = 11; // PPN (persen) — sesuaikan dengan ketentuan perpajakan yang berlaku

export const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
export const fmtIdr = (n) => `Rp ${Math.round(Number(n) || 0).toLocaleString('id-ID')}`;
