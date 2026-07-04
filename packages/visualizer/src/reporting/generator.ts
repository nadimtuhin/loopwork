import { IReportGenerator, ReportData, ReportOptions } from './types'
import { MarkdownReportGenerator } from './markdown'
import { PDFReportGenerator } from './pdf'
import { join } from 'path'
import { mkdir } from 'fs/promises'

export class ReportGenerator implements IReportGenerator {
  private markdownGenerator = new MarkdownReportGenerator()
  private pdfGenerator = new PDFReportGenerator()

  async generate(data: ReportData, options?: ReportOptions): Promise<string[]> {
    const generatedFiles: string[] = []
    const outputPath = options?.outputPath || '.loopwork/reports'
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const baseFileName = `report-${data.namespace}-${timestamp}`

    await mkdir(outputPath, { recursive: true })

    const format = options?.format || 'both'

    if (format === 'markdown' || format === 'both') {
      const mdContent = this.markdownGenerator.generate(data, options)
      const mdPath = join(outputPath, `${baseFileName}.md`)
      await Bun.write(mdPath, mdContent)
      generatedFiles.push(mdPath)
    }

    if (format === 'pdf' || format === 'both') {
      const pdfPath = join(outputPath, `${baseFileName}.pdf`)
      await this.pdfGenerator.generate(data, pdfPath, options)
      generatedFiles.push(pdfPath)
    }

    return generatedFiles
  }
}
