/* eslint-disable @typescript-eslint/require-await */
import { Contracts, DTO } from "@ardenthq/sdk-profiles";
import userEvent from "@testing-library/user-event";
import { createHashHistory } from "history";
import nock from "nock";
import React from "react";
import { Route, Router } from "react-router-dom";

import { FormStep } from "./FormStep";
import { ReviewStep } from "./ReviewStep";
import { SendIpfs } from "./SendIpfs";
import { SummaryStep } from "./SummaryStep";
import { minVersionList, StepsProvider } from "@/app/contexts";
import { translations } from "@/domains/transaction/i18n";
import ipfsFixture from "@/tests/fixtures/coins/ark/devnet/transactions/ipfs.json";
import {
	env,
	getDefaultProfileId,
	getDefaultWalletId,
	getDefaultWalletMnemonic,
	MNEMONICS,
	render,
	renderWithForm,
	screen,
	syncFees,
	waitFor,
	within,
	mockNanoXTransport,
	mockProfileWithPublicAndTestNetworks,
} from "@/utils/testing-library";

const passphrase = getDefaultWalletMnemonic();
const fixtureProfileId = getDefaultProfileId();

const createTransactionMock = (wallet: Contracts.IReadWriteWallet) =>
	// @ts-ignore
	jest.spyOn(wallet.transaction(), "transaction").mockReturnValue({
		amount: () => +ipfsFixture.data.amount / 1e8,
		data: () => ({ data: () => ipfsFixture.data }),
		explorerLink: () => `https://test.arkscan.io/transaction/${ipfsFixture.data.id}`,
		fee: () => +ipfsFixture.data.fee / 1e8,
		hash: () => ipfsFixture.data.asset.ipfs,
		id: () => ipfsFixture.data.id,
		isMultiSignatureRegistration: () => false,
		recipient: () => ipfsFixture.data.recipient,
		sender: () => ipfsFixture.data.sender,
		type: () => "ipfs",
		usesMultiSignature: () => false,
	});

let profile: Contracts.IProfile;
let wallet: Contracts.IReadWriteWallet;
let getVersionSpy: jest.SpyInstance;

const continueButton = () => screen.getByTestId("StepNavigation__continue-button");
const sendButton = () => screen.getByTestId("StepNavigation__send-button");
const formStep = () => screen.findByTestId("SendIpfs__form-step");

const feeWarningContinueID = "FeeWarning__continue-button";
const reviewStepID = "SendIpfs__review-step";

jest.mock("@/utils/delay", () => ({
	delay: (callback: () => void) => callback(),
}));

describe("SendIpfs", () => {
	let resetProfileNetworksMock: () => void;

	beforeAll(async () => {
		profile = env.profiles().findById(fixtureProfileId);

		nock("https://ark-test.arkvault.io")
			.get("/api/transactions")
			.query({ address: "D8rr7B1d6TL6pf14LgMz4sKp1VBMs6YUYD" })
			.reply(200, require("tests/fixtures/coins/ark/devnet/transactions.json"))
			.get("/api/transactions/1e9b975eff66a731095876c3b6cbff14fd4dec3bb37a4127c46db3d69131067e")
			.reply(200, ipfsFixture);

		await env.profiles().restore(profile);
		await profile.sync();

		wallet = profile.wallets().findById("ac38fe6d-4b67-4ef1-85be-17c5f6841129");

		getVersionSpy = jest
			.spyOn(wallet.coin().ledger(), "getVersion")
			.mockResolvedValue(minVersionList[wallet.network().coin()]);

		await wallet.synchroniser().identity();

		await syncFees(profile);
	});

	afterAll(() => {
		getVersionSpy.mockRestore();
	});

	beforeEach(() => {
		resetProfileNetworksMock = mockProfileWithPublicAndTestNetworks(profile);
	});

	afterEach(() => {
		resetProfileNetworksMock();
	});

	it("should render form step", async () => {
		const history = createHashHistory();
		const ipfsURL = `/profiles/${fixtureProfileId}/wallets/${wallet.id()}/send-ipfs`;

		history.push(ipfsURL);

		const { asFragment } = renderWithForm(
			<Router history={history}>
				<Route path="/profiles/:profileId/wallets/:walletId/send-ipfs">
					<StepsProvider activeStep={1} steps={4}>
						<FormStep profile={profile} wallet={wallet} />
					</StepsProvider>
					,
				</Route>
			</Router>,
			{
				withProviders: true,
			},
		);

		await expect(formStep()).resolves.toBeVisible();

		expect(asFragment()).toMatchSnapshot();
	});

	it("should render review step", async () => {
		const history = createHashHistory();
		const ipfsURL = `/profiles/${fixtureProfileId}/wallets/${wallet.id()}/send-ipfs`;

		history.push(ipfsURL);

		const { asFragment, container } = renderWithForm(
			<Router history={history}>
				<Route path="/profiles/:profileId/wallets/:walletId/send-ipfs">
					<StepsProvider activeStep={1} steps={4}>
						<ReviewStep wallet={wallet} />
					</StepsProvider>
					,
				</Route>
			</Router>,
			{
				defaultValues: {
					fee: "0.1",
					hash: "QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco",
					senderAddress: wallet.address(),
				},
				withProviders: true,
			},
		);

		expect(screen.getByTestId(reviewStepID)).toBeInTheDocument();
		expect(container).toHaveTextContent(wallet.network().name());
		expect(container).toHaveTextContent("D8rr7B1d6TL6pf14LgMz4sKp1VBMs6YUYD");
		expect(container).toHaveTextContent("QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco");

		expect(asFragment()).toMatchSnapshot();
	});

	it("should render summary step", async () => {
		const history = createHashHistory();
		const ipfsURL = `/profiles/${fixtureProfileId}/wallets/${wallet.id()}/send-ipfs`;

		history.push(ipfsURL);

		const transaction = new DTO.ExtendedSignedTransactionData(
			await wallet
				.coin()
				.transaction()
				.ipfs({
					data: {
						hash: ipfsFixture.data.asset.ipfs,
					},
					fee: "1",
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

		const { asFragment } = renderWithForm(
			<Router history={history}>
				<Route path="/profiles/:profileId/wallets/:walletId/send-ipfs">
					<StepsProvider activeStep={1} steps={4}>
						<SummaryStep senderWallet={wallet} transaction={transaction} />
					</StepsProvider>
					,
				</Route>
			</Router>,
			{
				withProviders: true,
			},
		);

		await expect(screen.findByTestId("TransactionSuccessful")).resolves.toBeVisible();

		expect(asFragment()).toMatchSnapshot();
	});

	it("should navigate between steps", async () => {
		const ipfsURL = `/profiles/${fixtureProfileId}/wallets/${wallet.id()}/send-ipfs`;

		render(
			<Route path="/profiles/:profileId/wallets/:walletId/send-ipfs">
				<SendIpfs />
			</Route>,
			{
				route: ipfsURL,
			},
		);

		await expect(formStep()).resolves.toBeVisible();

		const networkLabel = `${wallet.network().coin()} ${wallet.network().name()}`;
		await waitFor(() => expect(screen.getByTestId("TransactionNetwork")).toHaveTextContent(networkLabel));
		await waitFor(() => expect(screen.getByTestId("TransactionSender")).toHaveTextContent(wallet.address()));

		userEvent.paste(screen.getByTestId("Input__hash"), "QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco");
		await waitFor(() =>
			expect(screen.getByTestId("Input__hash")).toHaveValue("QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco"),
		);

		userEvent.click(screen.getByText(translations.INPUT_FEE_VIEW_TYPE.ADVANCED));

		const inputElement: HTMLInputElement = screen.getByTestId("InputCurrency");

		inputElement.select();
		userEvent.paste(inputElement, "10");

		await waitFor(() => expect(inputElement).toHaveValue("10"));

		userEvent.click(continueButton());

		await expect(screen.findByTestId(reviewStepID)).resolves.toBeVisible();

		userEvent.click(screen.getByTestId("StepNavigation__back-button"));

		await expect(formStep()).resolves.toBeVisible();

		userEvent.click(continueButton());

		await expect(screen.findByTestId(reviewStepID)).resolves.toBeVisible();

		userEvent.click(continueButton());

		if (!profile.settings().get(Contracts.ProfileSetting.DoNotShowFeeWarning)) {
			await expect(screen.findByTestId(feeWarningContinueID)).resolves.toBeVisible();

			userEvent.click(screen.getByTestId(feeWarningContinueID));
		}

		await expect(screen.findByTestId("AuthenticationStep")).resolves.toBeVisible();
	});

	it("should send an IPFS transaction and go back to wallet page", async () => {
		const ipfsURL = `/profiles/${fixtureProfileId}/wallets/${wallet.id()}/send-ipfs`;

		const addressFromMnemonicMock = jest
			.spyOn(wallet.coin().address(), "fromMnemonic")
			.mockResolvedValue({ address: wallet.address() });

		const { asFragment, history } = render(
			<Route path="/profiles/:profileId/wallets/:walletId/send-ipfs">
				<SendIpfs />
			</Route>,
			{
				route: ipfsURL,
			},
		);

		await expect(formStep()).resolves.toBeVisible();

		const networkLabel = `${wallet.network().coin()} ${wallet.network().name()}`;
		await waitFor(() => expect(screen.getByTestId("TransactionNetwork")).toHaveTextContent(networkLabel));
		await waitFor(() => expect(screen.getByTestId("TransactionSender")).toHaveTextContent(wallet.address()));

		userEvent.paste(screen.getByTestId("Input__hash"), "QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco");
		await waitFor(() =>
			expect(screen.getByTestId("Input__hash")).toHaveValue("QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco"),
		);

		expect(within(screen.getByTestId("InputFee")).getAllByRole("radio")[1]).toBeChecked();

		userEvent.click(within(screen.getByTestId("InputFee")).getAllByRole("radio")[2]);
		await waitFor(() => expect(within(screen.getByTestId("InputFee")).getAllByRole("radio")[2]).toBeChecked());

		userEvent.click(screen.getByText(translations.INPUT_FEE_VIEW_TYPE.ADVANCED));

		const inputElement: HTMLInputElement = screen.getByTestId("InputCurrency");

		inputElement.select();
		userEvent.paste(inputElement, "10");

		await waitFor(() => expect(inputElement).toHaveValue("10"));

		userEvent.click(continueButton());

		await expect(screen.findByTestId(reviewStepID)).resolves.toBeVisible();

		userEvent.click(continueButton());

		if (!profile.settings().get(Contracts.ProfileSetting.DoNotShowFeeWarning)) {
			await expect(screen.findByTestId(feeWarningContinueID)).resolves.toBeVisible();

			userEvent.click(screen.getByTestId(feeWarningContinueID));
		}

		await expect(screen.findByTestId("AuthenticationStep")).resolves.toBeVisible();

		userEvent.paste(screen.getByTestId("AuthenticationStep__mnemonic"), passphrase);
		await waitFor(() => expect(screen.getByTestId("AuthenticationStep__mnemonic")).toHaveValue(passphrase));

		// Step 4
		const signMock = jest
			.spyOn(wallet.transaction(), "signIpfs")
			.mockReturnValue(Promise.resolve(ipfsFixture.data.id));
		const broadcastMock = jest.spyOn(wallet.transaction(), "broadcast").mockResolvedValue({
			accepted: [ipfsFixture.data.id],
			errors: {},
			rejected: [],
		});
		const transactionMock = createTransactionMock(wallet);

		await waitFor(() => expect(sendButton()).not.toBeDisabled());

		userEvent.click(sendButton());

		await expect(screen.findByTestId("TransactionSuccessful")).resolves.toBeVisible();

		expect(screen.getByTestId("TransactionSuccessful")).toHaveTextContent("1e9b975eff6");

		signMock.mockRestore();
		broadcastMock.mockRestore();
		transactionMock.mockRestore();

		expect(asFragment()).toMatchSnapshot();

		// Go back to wallet
		const historySpy = jest.spyOn(history, "push");

		userEvent.click(screen.getByTestId("StepNavigation__back-to-wallet-button"));

		expect(historySpy).toHaveBeenCalledWith(`/profiles/${profile.id()}/wallets/${wallet.id()}`);

		historySpy.mockRestore();

		expect(asFragment()).toMatchSnapshot();

		addressFromMnemonicMock.mockRestore();
	});

	it("should send an IPFS transaction navigating with keyboard", async () => {
		const ipfsURL = `/profiles/${fixtureProfileId}/wallets/${wallet.id()}/send-ipfs`;

		const addressFromMnemonicMock = jest
			.spyOn(wallet.coin().address(), "fromMnemonic")
			.mockResolvedValue({ address: wallet.address() });

		render(
			<Route path="/profiles/:profileId/wallets/:walletId/send-ipfs">
				<SendIpfs />
			</Route>,
			{
				route: ipfsURL,
			},
		);

		await expect(formStep()).resolves.toBeVisible();

		const networkLabel = `${wallet.network().coin()} ${wallet.network().name()}`;
		await waitFor(() => expect(screen.getByTestId("TransactionNetwork")).toHaveTextContent(networkLabel));
		await waitFor(() => expect(screen.getByTestId("TransactionSender")).toHaveTextContent(wallet.address()));

		userEvent.paste(screen.getByTestId("Input__hash"), "QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco");
		await waitFor(() =>
			expect(screen.getByTestId("Input__hash")).toHaveValue("QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco"),
		);

		expect(within(screen.getByTestId("InputFee")).getAllByRole("radio")[1]).toBeChecked();

		userEvent.click(within(screen.getByTestId("InputFee")).getAllByRole("radio")[2]);
		await waitFor(() => expect(within(screen.getByTestId("InputFee")).getAllByRole("radio")[2]).toBeChecked());

		userEvent.click(screen.getByText(translations.INPUT_FEE_VIEW_TYPE.ADVANCED));

		const inputElement: HTMLInputElement = screen.getByTestId("InputCurrency");

		inputElement.select();
		userEvent.paste(inputElement, "10");

		await waitFor(() => expect(inputElement).toHaveValue("10"));

		userEvent.keyboard("{enter}");

		await expect(screen.findByTestId(reviewStepID)).resolves.toBeVisible();

		userEvent.keyboard("{enter}");

		if (!profile.settings().get(Contracts.ProfileSetting.DoNotShowFeeWarning)) {
			await expect(screen.findByTestId(feeWarningContinueID)).resolves.toBeVisible();

			userEvent.click(screen.getByTestId(feeWarningContinueID));
		}

		await expect(screen.findByTestId("AuthenticationStep")).resolves.toBeVisible();

		userEvent.paste(screen.getByTestId("AuthenticationStep__mnemonic"), passphrase);
		await waitFor(() => expect(screen.getByTestId("AuthenticationStep__mnemonic")).toHaveValue(passphrase));

		// Step 4
		const signMock = jest
			.spyOn(wallet.transaction(), "signIpfs")
			.mockReturnValue(Promise.resolve(ipfsFixture.data.id));
		const broadcastMock = jest.spyOn(wallet.transaction(), "broadcast").mockResolvedValue({
			accepted: [ipfsFixture.data.id],
			errors: {},
			rejected: [],
		});
		const transactionMock = createTransactionMock(wallet);

		await waitFor(() => expect(sendButton()).not.toBeDisabled());

		userEvent.keyboard("{enter}");
		userEvent.click(sendButton());

		await expect(screen.findByTestId("TransactionSuccessful")).resolves.toBeVisible();

		expect(screen.getByTestId("TransactionSuccessful")).toHaveTextContent("1e9b975eff");

		signMock.mockRestore();
		broadcastMock.mockRestore();
		transactionMock.mockRestore();
		addressFromMnemonicMock.mockRestore();
	});

	it("should return to form step by cancelling fee warning", async () => {
		const ipfsURL = `/profiles/${fixtureProfileId}/wallets/${wallet.id()}/send-ipfs`;
		const addressFromMnemonicMock = jest
			.spyOn(wallet.coin().address(), "fromMnemonic")
			.mockResolvedValue({ address: wallet.address() });

		render(
			<Route path="/profiles/:profileId/wallets/:walletId/send-ipfs">
				<SendIpfs />
			</Route>,
			{
				route: ipfsURL,
			},
		);

		await expect(formStep()).resolves.toBeVisible();

		const networkLabel = `${wallet.network().coin()} ${wallet.network().name()}`;
		await waitFor(() => expect(screen.getByTestId("TransactionNetwork")).toHaveTextContent(networkLabel));
		await waitFor(() => expect(screen.getByTestId("TransactionSender")).toHaveTextContent(wallet.address()));

		userEvent.paste(screen.getByTestId("Input__hash"), "QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco");
		await waitFor(() =>
			expect(screen.getByTestId("Input__hash")).toHaveValue("QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco"),
		);

		userEvent.click(screen.getByText(translations.INPUT_FEE_VIEW_TYPE.ADVANCED));

		const inputElement: HTMLInputElement = screen.getByTestId("InputCurrency");

		inputElement.select();
		userEvent.paste(inputElement, "10");

		await waitFor(() => expect(inputElement).toHaveValue("10"));

		expect(continueButton()).not.toBeDisabled();

		userEvent.click(continueButton());

		await expect(screen.findByTestId(reviewStepID)).resolves.toBeVisible();

		userEvent.click(continueButton());

		expect(screen.getByTestId("FeeWarning__cancel-button")).toBeInTheDocument();

		userEvent.click(screen.getByTestId("FeeWarning__cancel-button"));

		await expect(formStep()).resolves.toBeVisible();

		addressFromMnemonicMock.mockRestore();
	});

	it("should proceed to authentication step by confirming fee warning", async () => {
		const ipfsURL = `/profiles/${fixtureProfileId}/wallets/${wallet.id()}/send-ipfs`;

		render(
			<Route path="/profiles/:profileId/wallets/:walletId/send-ipfs">
				<SendIpfs />
			</Route>,
			{
				route: ipfsURL,
			},
		);

		await expect(formStep()).resolves.toBeVisible();

		const networkLabel = `${wallet.network().coin()} ${wallet.network().name()}`;
		await waitFor(() => expect(screen.getByTestId("TransactionNetwork")).toHaveTextContent(networkLabel));
		await waitFor(() => expect(screen.getByTestId("TransactionSender")).toHaveTextContent(wallet.address()));

		userEvent.paste(screen.getByTestId("Input__hash"), "QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco");
		await waitFor(() =>
			expect(screen.getByTestId("Input__hash")).toHaveValue("QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco"),
		);

		// Fee
		userEvent.click(screen.getByText(translations.INPUT_FEE_VIEW_TYPE.ADVANCED));

		const inputElement: HTMLInputElement = screen.getByTestId("InputCurrency");

		inputElement.select();
		userEvent.paste(inputElement, "10");

		await waitFor(() => expect(inputElement).toHaveValue("10"));

		expect(continueButton()).not.toBeDisabled();

		userEvent.click(continueButton());

		await expect(screen.findByTestId(reviewStepID)).resolves.toBeVisible();

		userEvent.click(continueButton());

		await expect(screen.findByTestId(feeWarningContinueID)).resolves.toBeVisible();

		userEvent.click(screen.getByTestId(feeWarningContinueID));

		await expect(screen.findByTestId("AuthenticationStep")).resolves.toBeVisible();
	});

	it("should error if wrong mnemonic", async () => {
		const ipfsURL = `/profiles/${fixtureProfileId}/wallets/${wallet.id()}/send-ipfs`;

		const { asFragment } = render(
			<Route path="/profiles/:profileId/wallets/:walletId/send-ipfs">
				<SendIpfs />
			</Route>,
			{
				route: ipfsURL,
			},
		);

		await expect(formStep()).resolves.toBeVisible();

		const networkLabel = `${wallet.network().coin()} ${wallet.network().name()}`;
		await waitFor(() => expect(screen.getByTestId("TransactionNetwork")).toHaveTextContent(networkLabel));
		await waitFor(() => expect(screen.getByTestId("TransactionSender")).toHaveTextContent(wallet.address()));

		userEvent.paste(screen.getByTestId("Input__hash"), "QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco");
		await waitFor(() =>
			expect(screen.getByTestId("Input__hash")).toHaveValue("QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco"),
		);

		// Fee
		userEvent.click(screen.getByText(translations.INPUT_FEE_VIEW_TYPE.ADVANCED));

		const inputElement: HTMLInputElement = screen.getByTestId("InputCurrency");

		inputElement.select();
		userEvent.paste(inputElement, "10");

		await waitFor(() => expect(inputElement).toHaveValue("10"));

		expect(continueButton()).not.toBeDisabled();

		userEvent.click(continueButton());

		await expect(screen.findByTestId(reviewStepID)).resolves.toBeVisible();

		userEvent.click(continueButton());

		if (!profile.settings().get(Contracts.ProfileSetting.DoNotShowFeeWarning)) {
			await expect(screen.findByTestId(feeWarningContinueID)).resolves.toBeVisible();

			userEvent.click(screen.getByTestId(feeWarningContinueID));
		}

		// Auth Step
		await expect(screen.findByTestId("AuthenticationStep")).resolves.toBeVisible();

		const mnemonicInput: HTMLInputElement = screen.getByTestId("AuthenticationStep__mnemonic");

		userEvent.paste(mnemonicInput, passphrase);
		await waitFor(() => expect(mnemonicInput).toHaveValue(passphrase));

		expect(sendButton()).not.toBeDisabled();

		mnemonicInput.select();
		userEvent.paste(mnemonicInput, MNEMONICS[0]);
		await waitFor(() => expect(mnemonicInput).toHaveValue(MNEMONICS[0]));

		expect(sendButton()).toBeDisabled();

		await waitFor(() => expect(screen.getByTestId("Input__error")).toBeVisible());

		expect(screen.getByTestId("Input__error")).toHaveAttribute(
			"data-errortext",
			"This mnemonic does not correspond to your wallet",
		);
		expect(asFragment()).toMatchSnapshot();
	});

	it("should go back to wallet details", async () => {
		const ipfsURL = `/profiles/${fixtureProfileId}/wallets/${wallet.id()}/send-ipfs`;

		const { history } = render(
			<Route path="/profiles/:profileId/wallets/:walletId/send-ipfs">
				<SendIpfs />
			</Route>,
			{
				route: ipfsURL,
			},
		);

		await expect(formStep()).resolves.toBeVisible();

		const historySpy = jest.spyOn(history, "push").mockImplementation();

		userEvent.click(screen.getByTestId("StepNavigation__back-button"));

		expect(historySpy).toHaveBeenCalledWith(`/profiles/${profile.id()}/wallets/${wallet.id()}`);

		historySpy.mockRestore();
	});

	it("should show error step and go back", async () => {
		const ipfsURL = `/profiles/${fixtureProfileId}/wallets/${wallet.id()}/send-ipfs`;

		const addressFromMnemonicMock = jest
			.spyOn(wallet.coin().address(), "fromMnemonic")
			.mockResolvedValue({ address: wallet.address() });

		const { asFragment, history } = render(
			<Route path="/profiles/:profileId/wallets/:walletId/send-ipfs">
				<SendIpfs />
			</Route>,
			{
				route: ipfsURL,
			},
		);

		await expect(formStep()).resolves.toBeVisible();

		const networkLabel = `${wallet.network().coin()} ${wallet.network().name()}`;
		await waitFor(() => expect(screen.getByTestId("TransactionNetwork")).toHaveTextContent(networkLabel));
		await waitFor(() => expect(screen.getByTestId("TransactionSender")).toHaveTextContent(wallet.address()));

		userEvent.paste(screen.getByTestId("Input__hash"), "QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco");
		await waitFor(() =>
			expect(screen.getByTestId("Input__hash")).toHaveValue("QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco"),
		);

		userEvent.click(screen.getByText(translations.INPUT_FEE_VIEW_TYPE.ADVANCED));

		const inputElement: HTMLInputElement = screen.getByTestId("InputCurrency");

		inputElement.select();
		userEvent.paste(inputElement, "10");

		await waitFor(() => expect(inputElement).toHaveValue("10"));

		expect(continueButton()).not.toBeDisabled();

		userEvent.click(continueButton());

		await expect(screen.findByTestId(reviewStepID)).resolves.toBeVisible();

		userEvent.click(continueButton());

		if (!profile.settings().get(Contracts.ProfileSetting.DoNotShowFeeWarning)) {
			await expect(screen.findByTestId(feeWarningContinueID)).resolves.toBeVisible();

			userEvent.click(screen.getByTestId(feeWarningContinueID));
		}

		await expect(screen.findByTestId("AuthenticationStep")).resolves.toBeVisible();

		userEvent.paste(screen.getByTestId("AuthenticationStep__mnemonic"), passphrase);
		await waitFor(() => expect(screen.getByTestId("AuthenticationStep__mnemonic")).toHaveValue(passphrase));

		// Step 5 (skip step 4 for now - ledger confirmation)
		const signMock = jest.spyOn(wallet.transaction(), "signIpfs").mockImplementation(() => {
			throw new Error("broadcast error");
		});

		userEvent.click(sendButton());

		await expect(screen.findByTestId("ErrorStep")).resolves.toBeVisible();

		expect(screen.getByTestId("ErrorStep__errorMessage")).toHaveTextContent("broadcast error");
		expect(screen.getByTestId("ErrorStep__wallet-button")).toBeInTheDocument();
		expect(asFragment()).toMatchSnapshot();

		const historyMock = jest.spyOn(history, "push").mockReturnValue();

		userEvent.click(screen.getByTestId("ErrorStep__wallet-button"));

		expect(historyMock).toHaveBeenCalledWith(`/profiles/${getDefaultProfileId()}/wallets/${getDefaultWalletId()}`);

		signMock.mockRestore();
		addressFromMnemonicMock.mockRestore();
	});

	it("should show an error if an invalid IPFS hash is entered", async () => {
		const ipfsURL = `/profiles/${fixtureProfileId}/wallets/${wallet.id()}/send-ipfs`;

		const { asFragment } = render(
			<Route path="/profiles/:profileId/wallets/:walletId/send-ipfs">
				<SendIpfs />
			</Route>,
			{
				route: ipfsURL,
			},
		);

		userEvent.paste(screen.getByTestId("Input__hash"), "invalid-ipfs-hash");
		await waitFor(() => expect(screen.getByTestId("Input__hash")).toHaveValue("invalid-ipfs-hash"));

		expect(screen.getByTestId("Input__error")).toBeVisible();

		expect(asFragment()).toMatchSnapshot();
	});

	it("should send an ipfs transaction with a multisig wallet", async () => {
		const isMultiSignatureSpy = jest.spyOn(wallet, "isMultiSignature").mockReturnValue(true);
		const multisignatureSpy = jest
			.spyOn(wallet.multiSignature(), "all")
			.mockReturnValue({ min: 2, publicKeys: [wallet.publicKey()!, profile.wallets().last().publicKey()!] });

		const ipfsURL = `/profiles/${fixtureProfileId}/transactions/${wallet.id()}/ipfs`;

		const { asFragment } = render(
			<Route path="/profiles/:profileId/transactions/:walletId/ipfs">
				<SendIpfs />
			</Route>,
			{
				route: ipfsURL,
			},
		);

		await expect(formStep()).resolves.toBeVisible();

		const networkLabel = `${wallet.network().coin()} ${wallet.network().name()}`;
		await waitFor(() => expect(screen.getByTestId("TransactionNetwork")).toHaveTextContent(networkLabel));
		await waitFor(() => expect(screen.getByTestId("TransactionSender")).toHaveTextContent(wallet.address()));

		userEvent.paste(screen.getByTestId("Input__hash"), "QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco");
		await waitFor(() =>
			expect(screen.getByTestId("Input__hash")).toHaveValue("QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco"),
		);

		userEvent.click(screen.getByText(translations.INPUT_FEE_VIEW_TYPE.ADVANCED));

		const inputElement: HTMLInputElement = screen.getByTestId("InputCurrency");

		inputElement.select();
		userEvent.paste(inputElement, "10");

		await waitFor(() => expect(inputElement).toHaveValue("10"));

		expect(continueButton()).not.toBeDisabled();

		userEvent.click(continueButton());

		await expect(screen.findByTestId(reviewStepID)).resolves.toBeVisible();

		userEvent.click(continueButton());

		if (!profile.settings().get(Contracts.ProfileSetting.DoNotShowFeeWarning)) {
			await expect(screen.findByTestId(feeWarningContinueID)).resolves.toBeVisible();

			userEvent.click(screen.getByTestId(feeWarningContinueID));
		}

		// Step 4
		const signMock = jest
			.spyOn(wallet.transaction(), "signIpfs")
			.mockReturnValue(Promise.resolve(ipfsFixture.data.id));

		const broadcastMock = jest.spyOn(wallet.transaction(), "broadcast").mockResolvedValue({
			accepted: [ipfsFixture.data.id],
			errors: {},
			rejected: [],
		});

		const transactionMock = createTransactionMock(wallet);

		userEvent.click(continueButton());

		await expect(screen.findByTestId("TransactionSuccessful")).resolves.toBeVisible();

		expect(screen.getByTestId("TransactionSuccessful")).toHaveTextContent("1e9b975eff");

		expect(signMock).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.anything(),
				fee: expect.any(Number),
				signatory: expect.any(Object),
			}),
		);

		signMock.mockRestore();
		broadcastMock.mockRestore();
		transactionMock.mockRestore();
		multisignatureSpy.mockRestore();
		isMultiSignatureSpy.mockRestore();

		expect(asFragment()).toMatchSnapshot();
	});

	it("should send a ipfs transfer with a ledger wallet", async () => {
		jest.spyOn(wallet.coin(), "__construct").mockImplementation();
		const isNanoXMock = jest.spyOn(wallet.ledger(), "isNanoX").mockResolvedValue(true);

		const isLedgerSpy = jest.spyOn(wallet, "isLedger").mockImplementation(() => true);

		const getPublicKeySpy = jest
			.spyOn(wallet.coin().ledger(), "getPublicKey")
			.mockResolvedValue("0335a27397927bfa1704116814474d39c2b933aabb990e7226389f022886e48deb");

		const signTransactionSpy = jest
			.spyOn(wallet.transaction(), "signIpfs")
			.mockReturnValue(Promise.resolve(ipfsFixture.data.id));

		const broadcastMock = jest.spyOn(wallet.transaction(), "broadcast").mockResolvedValue({
			accepted: [ipfsFixture.data.id],
			errors: {},
			rejected: [],
		});

		const nanoXTransportMock = mockNanoXTransport();
		const transactionMock = createTransactionMock(wallet);

		const ipfsURL = `/profiles/${fixtureProfileId}/transactions/${wallet.id()}/ipfs`;

		const { asFragment } = render(
			<Route path="/profiles/:profileId/transactions/:walletId/ipfs">
				<SendIpfs />
			</Route>,
			{
				route: ipfsURL,
			},
		);

		await expect(formStep()).resolves.toBeVisible();

		const networkLabel = `${wallet.network().coin()} ${wallet.network().name()}`;
		await waitFor(() => expect(screen.getByTestId("TransactionNetwork")).toHaveTextContent(networkLabel));
		await waitFor(() => expect(screen.getByTestId("TransactionSender")).toHaveTextContent(wallet.address()));

		userEvent.paste(screen.getByTestId("Input__hash"), "QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco");
		await waitFor(() =>
			expect(screen.getByTestId("Input__hash")).toHaveValue("QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco"),
		);

		userEvent.click(screen.getByText(translations.INPUT_FEE_VIEW_TYPE.ADVANCED));

		const inputElement: HTMLInputElement = screen.getByTestId("InputCurrency");

		inputElement.select();
		userEvent.paste(inputElement, "10");

		await waitFor(() => expect(inputElement).toHaveValue("10"));

		const address = wallet.address();
		const balance = wallet.balance();
		const derivationPath = "m/44'/1'/1'/0/0";
		const votes = wallet.voting().current();
		const publicKey = wallet.publicKey();

		const mockWalletData = jest.spyOn(wallet.data(), "get").mockImplementation((key) => {
			if (key == Contracts.WalletData.Address) {
				return address;
			}
			if (key == Contracts.WalletData.Address) {
				return address;
			}

			if (key == Contracts.WalletData.Balance) {
				return balance;
			}

			if (key == Contracts.WalletData.PublicKey) {
				return publicKey;
			}

			if (key == Contracts.WalletData.Votes) {
				return votes;
			}

			if (key == Contracts.WalletData.DerivationPath) {
				return derivationPath;
			}
		});

		expect(continueButton()).not.toBeDisabled();

		userEvent.click(continueButton());

		await expect(screen.findByTestId(reviewStepID)).resolves.toBeVisible();

		userEvent.click(continueButton());

		if (!profile.settings().get(Contracts.ProfileSetting.DoNotShowFeeWarning)) {
			await expect(screen.findByTestId(feeWarningContinueID)).resolves.toBeVisible();

			userEvent.click(screen.getByTestId(feeWarningContinueID));
		}

		// Auto broadcast
		await expect(screen.findByTestId("TransactionSuccessful")).resolves.toBeVisible();

		getPublicKeySpy.mockRestore();
		broadcastMock.mockRestore();
		isLedgerSpy.mockRestore();
		signTransactionSpy.mockRestore();
		transactionMock.mockRestore();
		mockWalletData.mockRestore();
		isNanoXMock.mockRestore();
		nanoXTransportMock.mockRestore();

		expect(asFragment()).toMatchSnapshot();
	});
});
