import PDFDocument from 'pdfkit'
import { ReportData, ReportOptions } from './types'
import { createWriteStream } from 'fs'

export class PDFReportGenerator {
  async generate(data: ReportData, outputPath: string, options?: ReportOptions): Promise<void> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument()
      const stream = createWriteStream(outputPath)

      doc.pipe(stream)

      doc.fontSize(25).text('Loopwork Execution Report', { align: 'center' })
      doc.moveDown()
      doc.fontSize(12).text(`Namespace: ${data.namespace}`)
      doc.text(`Timestamp: ${data.timestamp}`)
      doc.moveDown()

      doc.fontSize(18).text('Summary')
      doc.fontSize(12).text(`Total Tasks: ${data.stats.completed + data.stats.failed}`)
      doc.text(`Completed: ${data.stats.completed}`)
      doc.text(`Failed: ${data.stats.failed}`)
      doc.text(`Duration: ${(data.stats.duration / 1000).toFixed(2)}s`)
      doc.moveDown()

      if (data.costSummary && options?.includeCost !== false) {
        doc.fontSize(18).text('Cost Summary')
        doc.fontSize(12).text(`Total Cost: $${data.costSummary.totalCost.toFixed(4)}`)
        doc.text(`Total Tokens: ${data.costSummary.totalTokens.toLocaleString()}`)
        doc.moveDown()

        if (Object.keys(data.costSummary.modelUsage).length > 0) {
          doc.fontSize(14).text('Model Usage')
          for (const [model, usage] of Object.entries(data.costSummary.modelUsage)) {
            doc.fontSize(10).text(`${model}: $${usage.cost.toFixed(4)} (${usage.tokens.toLocaleString()} tokens)`)
          }
          doc.moveDown()
        }
      }

      if (options?.includeTasks !== false) {
        doc.fontSize(18).text('Task Details')
        doc.moveDown(0.5)

        for (const task of data.tasks) {
          doc.fontSize(12).text(`${task.id}: ${task.title}`)
          doc.fontSize(10).text(`Status: ${task.status} | Priority: ${task.priority} | Feature: ${task.feature || '-'}`)
          if (task.lastError) {
            doc.fillColor('red').text(`Error: ${task.lastError}`).fillColor('black')
          }
          doc.moveDown(0.5)
          
          if (doc.y > 700) {
            doc.addPage()
          }
        }
      }

      doc.end()

      stream.on('finish', () => resolve())
      stream.on('error', (err) => reject(err))
    })
  }
}
