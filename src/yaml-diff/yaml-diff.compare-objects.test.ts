import { describe, expect, test } from "bun:test"
import { compareObjects } from "./yaml-diff.compare-objects"

describe("compareObjects null handling", () => {
	test("added key with null value does not crash and renders as null", () => {
		const out = compareObjects({ name: "web" }, { name: "web", resources: null }, "spec", "Deployment/app")
		expect(out.some((line) => line.includes("resources: null"))).toBe(true)
	})

	test("removed key with null value does not crash and renders as null", () => {
		const out = compareObjects({ name: "web", resources: null }, { name: "web" }, "spec", "Deployment/app")
		expect(out.some((line) => line.includes("resources: null"))).toBe(true)
	})

	test("null -> object transition is treated as value change, not recursion", () => {
		const out = compareObjects({ foo: null }, { foo: { bar: 1 } }, "spec", "Deployment/app")
		expect(out.length).toBeGreaterThan(0)
	})

	test("object -> null transition is treated as value change, not recursion", () => {
		const out = compareObjects({ foo: { bar: 1 } }, { foo: null }, "spec", "Deployment/app")
		expect(out.length).toBeGreaterThan(0)
	})

	test("nested array item with new null-valued key (original crash repro)", () => {
		const oldVal = {
			containers: [{ name: "web", image: "nginx:1.0" }],
		}
		const newVal = {
			containers: [{ name: "web", image: "nginx:1.0", resources: null }],
		}
		const out = compareObjects(oldVal, newVal, "spec.template.spec", "Deployment/app")
		expect(out.some((line) => line.includes("resources: null"))).toBe(true)
	})
})
