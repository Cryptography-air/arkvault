import { Contracts } from "@ardenthq/sdk-profiles";
import { createHashHistory } from "history";
import userEvent from "@testing-library/user-event";
import nock from "nock";
import React from "react";

import { TransactionExportForm } from ".";
import {
	env,
	getDefaultProfileId,
	renderWithForm,
	screen,
	syncDelegates,
	waitFor,
	within,
} from "@/utils/testing-library";

const history = createHashHistory();

const fixtureProfileId = getDefaultProfileId();
let dashboardURL: string;

const dateToggle = () =>
	within(screen.getByTestId("TransactionExportForm--daterange-options")).getByTestId("CollapseToggleButton");

describe("TransactionExportForm", () => {
	let profile: Contracts.IProfile;

	beforeAll(() => {
		nock.disableNetConnect();
		nock("https://ark-test.arkvault.io")
			.get("/api/delegates")
			.query({ page: "1" })
			.reply(200, require("tests/fixtures/coins/ark/devnet/delegates.json"))
			.get("/api/transactions")
			.query({ address: "D8rr7B1d6TL6pf14LgMz4sKp1VBMs6YUYD", orderBy: "timestamp:asc" })
			.reply(200, require("tests/fixtures/coins/ark/devnet/transactions.json"))
			.persist();
	});

	beforeEach(async () => {
		dashboardURL = `/profiles/${fixtureProfileId}/dashboard`;
		history.push(dashboardURL);
		profile = env.profiles().findById(getDefaultProfileId());

		await syncDelegates(profile);

		await env.profiles().restore(profile);
		await profile.sync();
	});

	it.each(["xs", "sm", "md", "lg", "xl"])("should render in %s", async (breakpoint: string) => {
		const { asFragment } = renderWithForm(<TransactionExportForm wallet={profile.wallets().first()} />, {
			breakpoint,
		});

		expect(screen.getByTestId("TransactionExportForm")).toBeInTheDocument();

		await waitFor(() => {
			expect(dateToggle()).toBeEnabled();
		});

		expect(asFragment()).toMatchSnapshot();
	});

	it("should emit cancel", async () => {
		const onCancel = jest.fn();

		renderWithForm(<TransactionExportForm wallet={profile.wallets().first()} onCancel={onCancel} />);

		expect(screen.getByTestId("TransactionExportForm")).toBeInTheDocument();

		await waitFor(() => {
			expect(dateToggle()).toBeEnabled();
		});

		userEvent.click(screen.getByTestId("TransactionExportForm__cancel-button"));

		expect(onCancel).toHaveBeenCalledWith();
	});

	it("should render fiat column if wallets network is live", async () => {
		const walletSpy = jest.spyOn(profile.wallets().first().network(), "isLive").mockReturnValue(true);

		const onCancel = jest.fn();

		const { asFragment } = renderWithForm(
			<TransactionExportForm onCancel={onCancel} wallet={profile.wallets().first()} />,
		);

		expect(screen.getByTestId("TransactionExportForm__toggle-include-fiat-amount")).toBeInTheDocument();

		await waitFor(() => {
			expect(dateToggle()).toBeEnabled();
		});

		expect(asFragment()).toMatchSnapshot();

		walletSpy.mockRestore();
	});

	it("should select outgoing transactions", async () => {
		renderWithForm(<TransactionExportForm wallet={profile.wallets().first()} />);

		expect(screen.getByTestId("TransactionExportForm")).toBeInTheDocument();

		await waitFor(() => {
			expect(dateToggle()).toBeEnabled();
		});

		userEvent.click(screen.getAllByTestId("ButtonGroupOption")[1]);
	});

	it("should select last month", async () => {
		renderWithForm(<TransactionExportForm wallet={profile.wallets().first()} />);

		expect(screen.getByTestId("TransactionExportForm")).toBeInTheDocument();

		await waitFor(() => {
			expect(dateToggle()).toBeEnabled();
		});

		userEvent.click(screen.getAllByTestId("dropdown__toggle")[0]);

		expect(screen.getByTestId("dropdown__content")).toBeInTheDocument();

		userEvent.click(screen.getByTestId("dropdown__option--all-1"));
	});

	it("should render custom date range", async () => {
		renderWithForm(<TransactionExportForm wallet={profile.wallets().first()} onCancel={jest.fn()} />, {
			defaultValues: {
				from: new Date(),
				to: new Date(),
			},
			registerCallback: ({ register }) => {
				register("dateRange");
				register("from");
				register("to");
			},
		});

		expect(screen.getByTestId("TransactionExportForm")).toBeInTheDocument();

		await waitFor(() => {
			expect(dateToggle()).toBeEnabled();
		});

		userEvent.click(screen.getAllByTestId("dropdown__toggle")[0]);

		expect(screen.getByTestId("dropdown__content")).toBeInTheDocument();

		userEvent.click(screen.getByTestId("dropdown__option--custom-0"));
	});

	it("should select tab delimiter", async () => {
		renderWithForm(<TransactionExportForm wallet={profile.wallets().first()} />, {
			defaultValues: {
				delimiter: ",",
			},
		});

		expect(screen.getByTestId("TransactionExportForm")).toBeInTheDocument();

		await waitFor(() => {
			expect(dateToggle()).toBeEnabled();
		});

		userEvent.click(screen.getAllByTestId("dropdown__toggle")[1]);

		expect(screen.getByTestId("dropdown__content")).toBeInTheDocument();

		userEvent.click(screen.getByTestId("dropdown__option--2"));
	});
});
