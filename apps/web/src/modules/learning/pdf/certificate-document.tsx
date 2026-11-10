import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer"

export type CertificateStrings = {
  title: string
  awardedTo: string
  forCompleting: string
  issuedOn: string
  codeLabel: string
  verifyAt: string
  issuer: string
  logoPlaceholder: string
}

export type CertificateDocumentProps = {
  customerName: string
  courseTitle: string
  verificationCode: string
  strings: CertificateStrings
}

// Built-in PDF fonts only (no runtime font fetch). Brand fonts: D4, later.
const INK = "#1f1b16"
const MUTED = "#5c5448"
const ACCENT = "#8a5a2b"

const s = StyleSheet.create({
  page: { padding: 28, backgroundColor: "#ffffff" },
  frame: { flexGrow: 1, borderWidth: 2, borderColor: ACCENT, padding: 6 },
  inner: {
    flexGrow: 1,
    borderWidth: 0.75,
    borderColor: ACCENT,
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 28,
    paddingHorizontal: 48,
  },
  logo: {
    width: 64,
    height: 64,
    borderWidth: 1,
    borderColor: ACCENT,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  logoText: { fontFamily: "Helvetica", fontSize: 8, color: ACCENT },
  issuer: { fontFamily: "Helvetica", fontSize: 11, color: MUTED, letterSpacing: 2, marginTop: 8 },
  center: { alignItems: "center" },
  title: { fontFamily: "Times-Roman", fontSize: 36, color: INK, textAlign: "center" },
  awarded: { fontFamily: "Helvetica", fontSize: 12, color: MUTED, marginTop: 18 },
  name: { fontFamily: "Times-Bold", fontSize: 40, color: INK, textAlign: "center", marginTop: 6 },
  forCompleting: { fontFamily: "Helvetica", fontSize: 12, color: MUTED, marginTop: 16 },
  course: { fontFamily: "Times-Roman", fontSize: 26, color: INK, textAlign: "center", marginTop: 6 },
  date: { fontFamily: "Helvetica", fontSize: 12, color: INK, marginTop: 18 },
  footer: { alignItems: "center" },
  codeLabel: { fontFamily: "Helvetica", fontSize: 9, color: MUTED },
  code: { fontFamily: "Courier", fontSize: 15, color: INK, letterSpacing: 2, marginTop: 2 },
  verify: { fontFamily: "Helvetica", fontSize: 9, color: MUTED, marginTop: 6 },
})

export function CertificateDocument(p: CertificateDocumentProps) {
  const { strings: t } = p
  return (
    <Document title={`${t.title} - ${p.verificationCode}`} author={t.issuer} creator={t.issuer}>
      <Page size="A4" orientation="landscape" style={s.page}>
        <View style={s.frame}>
          <View style={s.inner}>
            <View style={s.center}>
              <View style={s.logo}>
                <Text style={s.logoText}>{t.logoPlaceholder}</Text>
              </View>
              <Text style={s.issuer}>{t.issuer}</Text>
            </View>
            <View style={s.center}>
              <Text style={s.title}>{t.title}</Text>
              <Text style={s.awarded}>{t.awardedTo}</Text>
              <Text style={s.name}>{p.customerName}</Text>
              <Text style={s.forCompleting}>{t.forCompleting}</Text>
              <Text style={s.course}>{p.courseTitle}</Text>
              <Text style={s.date}>{t.issuedOn}</Text>
            </View>
            <View style={s.footer}>
              <Text style={s.codeLabel}>{t.codeLabel}</Text>
              <Text style={s.code}>{p.verificationCode}</Text>
              <Text style={s.verify}>{t.verifyAt}</Text>
            </View>
          </View>
        </View>
      </Page>
    </Document>
  )
}
