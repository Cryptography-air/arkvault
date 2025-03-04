/* eslint-disable @typescript-eslint/require-await */
import { Contracts, DTO } from "@ardenthq/sdk-profiles";
import userEvent from "@testing-library/user-event";
import { createHashHistory } from "history";
import nock from "nock";
import React from "react";
import { Route } from "react-router-dom";

import { WalletDetails } from "./WalletDetails";
import { buildTranslations } from "@/app/i18n/helpers";
import walletMock from "@/tests/fixtures/coins/ark/devnet/wallets/D8rr7B1d6TL6pf14LgMz4sKp1VBMs6YUYD.json";
import {
	env,
	getDefaultProfileId,
	MNEMONICS,
	render,
	renderResponsiveWithRoute,
	RenderResult,
	screen,
	syncDelegates,
	waitFor,
	within,
} from "@/utils/testing-library";

const translations = buildTranslations();

const history = createHashHistory();
let walletUrl: string;

let profile: Contracts.IProfile;
let wallet: Contracts.IReadWriteWallet;
let blankWallet: Contracts.IReadWriteWallet;
let unvotedWallet: Contracts.IReadWriteWallet;

let emptyProfile: Contracts.IProfile;
let wallet2: Contracts.IReadWriteWallet;

const passphrase2 = MNEMONICS[3];

const renderPage = async ({
	waitForTopSection = true,
	waitForTransactions = true,
	withProfileSynchronizer = false,
} = {}) => {
	const utils: RenderResult = render(
		<Route path="/profiles/:profileId/wallets/:walletId">
			<WalletDetails />,
		</Route>,
		{
			history,
			route: walletUrl,
			withProfileSynchronizer,
		},
	);

	if (waitForTopSection) {
		await expect(screen.findByTestId("WalletVote")).resolves.toBeVisible();
	}

	if (waitForTransactions) {
		if (withProfileSynchronizer) {
			await waitFor(() =>
				expect(within(screen.getByTestId("TransactionTable")).queryAllByTestId("TableRow")).toHaveLength(1),
			);
		} else {
			await waitFor(() =>
				expect(within(screen.getByTestId("TransactionTable")).queryAllByTestId("TableRow")).not.toHaveLength(0),
			);
		}
	}

	return utils;
};

describe("WalletDetails", () => {
	const fixtures: Record<string, any> = {
		ipfs: undefined,
		multiPayment: undefined,
		multiSignature: undefined,
		transfer: undefined,
		unvote: undefined,
		vote: undefined,
	};

	const mockPendingTransfers = (wallet: Contracts.IReadWriteWallet) => {
		jest.spyOn(wallet.transaction(), "signed").mockReturnValue({
			[fixtures.transfer.id()]: fixtures.transfer,
		});
		jest.spyOn(wallet.transaction(), "canBeSigned").mockReturnValue(true);
		jest.spyOn(wallet.transaction(), "hasBeenSigned").mockReturnValue(true);
		jest.spyOn(wallet.transaction(), "isAwaitingConfirmation").mockReturnValue(true);
		jest.spyOn(wallet.transaction(), "transaction").mockImplementation(() => fixtures.transfer);
	};

	beforeAll(async () => {
		profile = env.profiles().findById(getDefaultProfileId());

		await env.profiles().restore(profile);
		await profile.sync();

		wallet = profile.wallets().findById("ac38fe6d-4b67-4ef1-85be-17c5f6841129");
		blankWallet = await profile.walletFactory().fromMnemonicWithBIP39({
			coin: "ARK",
			mnemonic: passphrase2,
			network: "ark.devnet",
		});

		unvotedWallet = await profile.walletFactory().fromMnemonicWithBIP39({
			coin: "ARK",
			mnemonic: MNEMONICS[0],
			network: "ark.devnet",
		});

		emptyProfile = env.profiles().findById("cba050f1-880f-45f0-9af9-cfe48f406052");

		wallet2 = await emptyProfile.walletFactory().fromMnemonicWithBIP39({
			coin: "ARK",
			mnemonic: MNEMONICS[1],
			network: "ark.devnet",
		});

		profile.wallets().push(blankWallet);
		profile.wallets().push(unvotedWallet);
		emptyProfile.wallets().push(wallet2);

		await syncDelegates(profile);

		nock("https://ark-test.arkvault.io")
			.get("/api/delegates")
			.query({ page: "1" })
			.reply(200, require("tests/fixtures/coins/ark/devnet/delegates.json"))
			.get(`/api/wallets/${unvotedWallet.address()}`)
			.reply(200, walletMock)
			.get(`/api/wallets/${blankWallet.address()}`)
			.reply(404, {
				error: "Not Found",
				message: "Wallet not found",
				statusCode: 404,
			})
			.get(`/api/wallets/${wallet2.address()}`)
			.reply(404, {
				error: "Not Found",
				message: "Wallet not found",
				statusCode: 404,
			})
			.get("/api/transactions")
			.query((parameters) => !!parameters.address)
			.reply(200, (url) => {
				const { meta, data } = require("tests/fixtures/coins/ark/devnet/transactions.json");
				const filteredUrl =
					"/api/transactions?page=1&limit=1&address=D8rr7B1d6TL6pf14LgMz4sKp1VBMs6YUYD&type=0&typeGroup=1";
				if (url === filteredUrl) {
					return { data: [], meta };
				}

				return {
					data: data.slice(0, 1),
					meta,
				};
			})
			.persist();

		// Mock musig server requests
		jest.spyOn(wallet.transaction(), "sync").mockResolvedValue(void 0);
	});

	beforeEach(async () => {
		fixtures.transfer = new DTO.ExtendedSignedTransactionData(
			await wallet
				.coin()
				.transaction()
				.transfer({
					data: {
						amount: 1,
						to: wallet.address(),
					},
					fee: 0.1,
					nonce: "1",
					signatory: await wallet
						.coin()
						.signatory()
						.multiSignature({
							min: 2,
							publicKeys: [wallet.publicKey()!, profile.wallets().last().publicKey()!],
						}),
				}),
			wallet,
		);

		walletUrl = `/profiles/${profile.id()}/wallets/${wallet.id()}`;
		history.push(walletUrl);
	});

	it("should render responsive", async () => {
		mockPendingTransfers(wallet);

		renderResponsiveWithRoute(
			<Route path="/profiles/:profileId/wallets/:walletId">
				<WalletDetails />,
			</Route>,
			"xs",
			{
				history,
				route: walletUrl,
			},
		);

		await expect(screen.findByTestId("PendingTransactions")).resolves.toBeVisible();

		userEvent.click(within(screen.getByTestId("PendingTransactions")).getAllByTestId("TableRow__mobile")[0]);

		await expect(screen.findByTestId("Modal__inner")).resolves.toBeVisible();

		userEvent.click(screen.getByTestId("Modal__close-button"));

		await waitFor(() => expect(screen.queryByTestId("Modal__inner")).not.toBeInTheDocument());
		jest.restoreAllMocks();
	});

	it("should render as not compact if user uses expanded tables", async () => {
		profile.settings().set(Contracts.ProfileSetting.UseExpandedTables, true);

		mockPendingTransfers(wallet);

		await renderPage();

		await expect(screen.findByTestId("PendingTransactions")).resolves.toBeVisible();

		userEvent.click(within(screen.getByTestId("PendingTransactions")).getAllByTestId("TableRow")[0]);

		await expect(screen.findByTestId("TableRemoveButton")).resolves.toBeVisible();

		profile.settings().set(Contracts.ProfileSetting.UseExpandedTables, false);

		jest.restoreAllMocks();
	});

	it("should render as compact on md screen even if user uses expanded tables", async () => {
		profile.settings().set(Contracts.ProfileSetting.UseExpandedTables, true);

		mockPendingTransfers(wallet);

		renderResponsiveWithRoute(
			<Route path="/profiles/:profileId/wallets/:walletId">
				<WalletDetails />,
			</Route>,
			"md",
			{
				history,
				route: walletUrl,
			},
		);

		await expect(screen.findByTestId("PendingTransactions")).resolves.toBeVisible();

		userEvent.click(within(screen.getByTestId("PendingTransactions")).getAllByTestId("TableRow")[0]);

		await expect(screen.findByTestId("TableRemoveButton--compact")).resolves.toBeVisible();

		profile.settings().set(Contracts.ProfileSetting.UseExpandedTables, false);

		jest.restoreAllMocks();
	});

	it("should not render wallet vote when the network does not support votes", async () => {
		const networkFeatureSpy = jest.spyOn(wallet.network(), "allowsVoting").mockReturnValue(false);

		await renderPage({ waitForTopSection: false });

		await waitFor(() => {
			expect(screen.queryByTestId("WalletVote")).not.toBeInTheDocument();
		});

		networkFeatureSpy.mockRestore();
	});

	it("should render when wallet not found for votes", async () => {
		jest.spyOn(blankWallet, "isMultiSignature").mockReturnValue(false);

		walletUrl = `/profiles/${profile.id()}/wallets/${blankWallet.id()}`;
		history.push(walletUrl);

		await renderPage({ waitForTopSection: true, waitForTransactions: false });

		await expect(screen.findByText(translations.COMMON.LEARN_MORE)).resolves.toBeVisible();
	});
});
