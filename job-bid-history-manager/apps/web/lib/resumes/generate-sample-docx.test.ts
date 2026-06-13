import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { exportOptimizedResumeToDocxBuffer } from "@/lib/resumes/docx-export";

const sampleResume = {
  header: {
    name: "Chad Christopher Taylor",
    headline: "Lead AI Engineer",
    email: "jrtaylor91714@gmail.com",
    links: "https://www.linkedin.com/in/jr-taylor-50172558",
    phone: "+1 (972) 301-7727",
    location: "McKinney, Texas, USA",
  },
  sections: [
    {
      type: "summary",
      title: "Summary",
      items: [
        {
          text: "Lead AI Engineer with 12+ years of experience designing AI systems, production ML pipelines, APIs, cloud-native systems, and data platforms for enterprise-scale products.",
        },
      ],
    },
    {
      type: "experience",
      title: "Work Experience",
      items: [
        {
          role: "Lead AI Engineer",
          company: "Eagle Analytix",
          location: "Remote, USA",
          duration: "Feb 2024 - Apr 2026",
          project:
            "Led architecture for a Pricing Intelligence Platform when brokers needed automated analysis of sales, inventory, historical pricing, and market signals.",
          bullets: [
            { text: "Defined reusable AI agent patterns for pricing workflows, including retrieval, grounding, memory, tool calling, validation, and human review." },
            { text: "Built ingestion and feature engineering pipelines for raw enterprise data, using Python, SQL, PySpark, and warehouse storage patterns." },
            { text: "Implemented embedding generation, vector database indexing, metadata filtering, and retrieval pipelines to support explainable broker analysis." },
            { text: "Built FastAPI backend APIs for pricing intelligence and Chrome extension workflows, integrating AI services with enterprise systems." },
          ],
        },
        {
          role: "Senior AI Engineer",
          company: "Meta",
          location: "Remote, USA",
          duration: "Oct 2022 - Nov 2023",
          project:
            "Supported LLaMA ecosystem integration workflows when internal teams needed scalable LLM experimentation, using Python, PyTorch, and distributed training patterns.",
          bullets: [
            { text: "Built distributed ML pipeline components for feature processing and model workflows, using Python, PyTorch, SQL, and large-scale compute." },
            { text: "Optimized inference APIs where model serving latency affected downstream services, using REST/gRPC patterns and GPU profiling." },
          ],
        },
      ],
    },
    {
      type: "skills",
      title: "Core Skills",
      items: [
        {
          category: "Artificial Intelligence & ML",
          values: ["LLMs", "GenAI Systems", "RAG Architecture", "Embeddings", "Vector Databases"],
        },
        {
          category: "Backend & API Engineering",
          values: ["Python", "FastAPI", "REST APIs", "GraphQL APIs", "gRPC", "Java"],
        },
        {
          category: "Cloud & Distributed Systems",
          values: ["AWS", "Docker", "Kubernetes", "Cloud-Native Architecture"],
        },
      ],
    },
    {
      type: "education",
      title: "Education",
      items: [
        {
          school: "Marymount California University",
          duration: "2017 - 2019",
          degree: "Master's Degree",
          field: "Computer Science",
          grade: "3.8",
        },
        {
          school: "Stanford University",
          duration: "2010 - 2014",
          degree: "Bachelor's Degree",
          field: "Computer Science",
          grade: "3.7",
        },
      ],
    },
  ],
};

describe("generate sample docx", () => {
  it.skipIf(!process.env.WRITE_SAMPLE_DOCX)("writes Professional Times sample to repo root", async () => {
    const buf = await exportOptimizedResumeToDocxBuffer(sampleResume, "chad-taylor");
    const outPath = resolve(__dirname, "../../../../sample-resume-professional-times.docx");
    writeFileSync(outPath, buf);
    expect(buf[0]).toBe(0x50);
    expect(buf[1]).toBe(0x4b);
    console.log(`Wrote ${outPath}`);
  });

  it.skipIf(!process.env.WRITE_SAMPLE_DOCX)("writes Chad Taylor PDF sample to repo root", async () => {
    const buf = await exportOptimizedResumeToDocxBuffer(sampleResume, "chad-taylor-pdf");
    const outPath = resolve(__dirname, "../../../../sample-resume-chad-taylor-pdf.docx");
    writeFileSync(outPath, buf);
    expect(buf[0]).toBe(0x50);
    expect(buf[1]).toBe(0x4b);
    console.log(`Wrote ${outPath}`);
  });

  it.skipIf(!process.env.WRITE_SAMPLE_DOCX)("writes FlowCV Modern sample to repo root", async () => {
    const buf = await exportOptimizedResumeToDocxBuffer(sampleResume, "flowcv");
    const outPath = resolve(__dirname, "../../../../sample-resume-flowcv.docx");
    writeFileSync(outPath, buf);
    expect(buf[0]).toBe(0x50);
    expect(buf[1]).toBe(0x4b);
    console.log(`Wrote ${outPath}`);
  });

  it.skipIf(!process.env.WRITE_SAMPLE_DOCX)("writes FlowCV Source Sans sample to repo root", async () => {
    const buf = await exportOptimizedResumeToDocxBuffer(sampleResume, "flowcv-source");
    const outPath = resolve(__dirname, "../../../../sample-resume-flowcv-source.docx");
    writeFileSync(outPath, buf);
    expect(buf[0]).toBe(0x50);
    expect(buf[1]).toBe(0x4b);
    console.log(`Wrote ${outPath}`);
  });
});
