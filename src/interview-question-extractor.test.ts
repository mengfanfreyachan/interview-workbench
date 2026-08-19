import { describe, expect, it } from "vitest";
import { extractInterviewQuestions } from "./interview-question-extractor";

describe("extractInterviewQuestions", () => {
  it("splits consecutive keycap emoji prompts without question marks", () => {
    const content = "面试问题：1⃣️自我介绍 2⃣️谈一段实习经历 3⃣️为什么选择法务 4⃣️反问";
    expect(extractInterviewQuestions(content)).toEqual([
      "自我介绍",
      "谈一段实习经历",
      "为什么选择法务",
      "反问",
    ]);
  });

  it("supports standard keycaps, circled numbers and Chinese numbering", () => {
    const content = "题目如下：1️⃣岗位理解 2️⃣讲项目经历\n③为什么选择我们\n四、职业规划";
    expect(extractInterviewQuestions(content)).toEqual([
      "岗位理解",
      "讲项目经历",
      "为什么选择我们",
      "职业规划",
    ]);
  });

  it("extracts the observed legal internship prompts from one continuous line", () => {
    const content = "面试问题：1⃣️自我介绍 2⃣️实习经历中印象深刻的工作 3⃣️诉讼经历中印象深刻的事件 4⃣️对互联网行业有什么了解 5⃣️对岗位工作职责的理解 6⃣️如何看待和应对法务实习中的基础性工作 7⃣️谈仅退款规则的理解 8⃣️反问";
    expect(extractInterviewQuestions(content)).toContain("如何看待和应对法务实习中的基础性工作");
    expect(extractInterviewQuestions(content)).toContain("谈仅退款规则的理解");
    expect(extractInterviewQuestions(content)).toHaveLength(8);
  });

  it("keeps conservative unnumbered questions and drops narrative lines", () => {
    expect(extractInterviewQuestions("面试氛围很好\n你会如何分析留存下降？\n做了自我介绍\n为什么选择这个岗位"))
      .toEqual(["你会如何分析留存下降？", "为什么选择这个岗位"]);
  });

  it("does not treat a numbered interview process as a question list", () => {
    expect(extractInterviewQuestions("面试流程：1⃣️投递简历 2⃣️参加面试 3⃣️等待结果")).toEqual([]);
  });

  it("extracts star-prefixed numbered prompts without treating preparation advice as questions", () => {
    const content = "🌟基本流程：先投递后面试。🌟1.请进行自我介绍（这个部分我介绍得比较详细） 🌟2.加入字节的原因（面试官对此比较感兴趣） 🌟3.学校地址以及住宿地址（考虑通勤情况） 🌟4.你过去的实习中遇到过最大的挑战以及自己是如何解决的（比较经典的面试题，建议提前准备） 🌟面试建议：1.了解简历上所撰写的实习内容 2.互联网行业涉及的法律问题，建议同学提前复习是否有知产基础";
    expect(extractInterviewQuestions(content)).toEqual([
      "请进行自我介绍",
      "加入字节的原因",
      "学校地址以及住宿地址",
      "你过去的实习中遇到过最大的挑战以及自己是如何解决的",
    ]);
  });

  it("deduplicates prompts and keeps the twelve-item boundary", () => {
    const items = Array.from({ length: 14 }, (_, index) => `${index + 1}、请介绍项目 ${index + 1}`).join("\n");
    expect(extractInterviewQuestions(`${items}\n14、请介绍项目 14`)).toHaveLength(12);
  });
});
