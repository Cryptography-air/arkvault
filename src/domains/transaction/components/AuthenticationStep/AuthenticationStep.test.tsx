import { PBKDF2 } from "@ardenthq/sdk-cryptography";
import { Contracts } from "@ardenthq/sdk-profiles";
import userEvent from "@testing-library/user-event";
import React from "react";
import reactRouterDom from "react-router-dom";
import { AuthenticationStep } from "./AuthenticationStep";
import {
	env,
	getDefaultProfileId,
	getDefaultWalletMnemonic,
	MNEMONICS,
	renderWithForm,
	screen,
	waitFor,
	mockNanoXTransport,
	mockNanoSTransport,
	mockLedgerTransportError,
} from "@/utils/testing-library";
const secondMnemonicID = "AuthenticationStep__second-mnemonic";
const secondSecretID = "AuthenticationStep__second-secret";
const ARKDevnet = "ark.devnet";

const itif = (condition: boolean) => (condition ? it : it.skip);

jest.mock("react-router-dom", () => ({
	...jest.requireActual("react-router-dom"),
	useHistory: jest.fn(),
}));

jest.mock("@/utils/delay", () => ({
	delay: (callback: () => void) => callback(),
}));

describe.each(["transaction", "message"])("AuthenticationStep (%s)", (subject) => {
	let wallet: Contracts.IReadWriteWallet;
	let profile: Contracts.IProfile;
	let goMock: any;

	beforeEach(() => {
		profile = env.profiles().findById(getDefaultProfileId());
		wallet = profile.wallets().first();
		goMock = jest.fn();

		jest.spyOn(reactRouterDom, "useHistory").mockReturnValue({ go: goMock });
	});

	it("should validate if mnemonic match the wallet address", async () => {
		wallet = await profile.walletFactory().fromMnemonicWithBIP39({
			coin: "ARK",
			mnemonic: MNEMONICS[0],
			network: ARKDevnet,
		});

		profile.wallets().push(wallet);

		jest.spyOn(wallet, "isSecondSignature").mockReturnValue(false);

		const { form } = renderWithForm(<AuthenticationStep subject={subject} wallet={wallet} />, {
			withProviders: true,
		});

		userEvent.paste(screen.getByTestId("AuthenticationStep__mnemonic"), "wrong passphrase");

		await waitFor(() => expect(form()?.formState.isValid).toBe(false));

		userEvent.clear(screen.getByTestId("AuthenticationStep__mnemonic"));
		userEvent.paste(screen.getByTestId("AuthenticationStep__mnemonic"), MNEMONICS[0]);

		await waitFor(() => expect(form()?.formState.isValid).toBeTruthy());

		profile.wallets().forget(wallet.id());
		jest.clearAllMocks();
	});

	itif(subject === "transaction")(
		"should validate if second mnemonic matches the wallet second public key",
		async () => {
			wallet = await profile.walletFactory().fromMnemonicWithBIP39({
				coin: "ARK",
				mnemonic: MNEMONICS[0],
				network: ARKDevnet,
			});

			profile.wallets().push(wallet);
			const secondMnemonic = MNEMONICS[1];
			const { publicKey } = await wallet.coin().publicKey().fromMnemonic(secondMnemonic);

			jest.spyOn(wallet, "isSecondSignature").mockReturnValue(true);
			jest.spyOn(wallet, "secondPublicKey").mockReturnValue(publicKey);

			const { form } = renderWithForm(<AuthenticationStep subject={subject} wallet={wallet} />, {
				withProviders: true,
			});

			userEvent.paste(screen.getByTestId("AuthenticationStep__mnemonic"), MNEMONICS[0]);

			userEvent.paste(screen.getByTestId(secondMnemonicID), "wrong second mnemonic");

			await waitFor(() => expect(form()?.formState.isValid).toBeFalsy());

			userEvent.clear(screen.getByTestId(secondMnemonicID));
			userEvent.paste(screen.getByTestId(secondMnemonicID), secondMnemonic);

			await waitFor(() => expect(form()?.formState.isValid).toBeTruthy());

			profile.wallets().forget(wallet.id());
			jest.clearAllMocks();
		},
	);

	itif(subject === "transaction")(
		"should validate if second secret matches the wallet second public key",
		async () => {
			wallet = await profile.walletFactory().fromSecret({
				coin: "ARK",
				network: ARKDevnet,
				secret: "abc",
			});

			const { form } = renderWithForm(<AuthenticationStep subject={subject} wallet={wallet} />, {
				withProviders: true,
			});

			userEvent.paste(screen.getByTestId("AuthenticationStep__secret"), "abc");

			userEvent.paste(screen.getByTestId(secondSecretID), "wrong second secret");

			await waitFor(() => expect(form()?.formState.isValid).toBeFalsy());

			userEvent.clear(screen.getByTestId(secondSecretID));
			userEvent.paste(screen.getByTestId(secondSecretID), "abc");

			await waitFor(() => expect(form()?.formState.isValid).toBeTruthy());
		},
	);

	it("should request mnemonic if wallet was imported using mnemonic", async () => {
		wallet = await profile.walletFactory().fromMnemonicWithBIP39({
			coin: "ARK",
			mnemonic: MNEMONICS[2],
			network: ARKDevnet,
		});

		const isSecondSignatureMock = jest.spyOn(wallet, "isSecondSignature").mockReturnValue(false);

		const { form, asFragment } = renderWithForm(<AuthenticationStep subject={subject} wallet={wallet} />, {
			withProviders: true,
		});

		await waitFor(() => expect(screen.queryByTestId(secondMnemonicID)).toBeNull());

		expect(screen.getByTestId("AuthenticationStep__mnemonic")).toBeInTheDocument();

		userEvent.paste(screen.getByTestId("AuthenticationStep__mnemonic"), MNEMONICS[0]);

		await waitFor(() => expect(form()?.getValues()).toStrictEqual({ mnemonic: MNEMONICS[0] }));

		expect(asFragment()).toMatchSnapshot();

		isSecondSignatureMock.mockRestore();
	});

	it("should request secret if wallet was imported using secret", async () => {
		wallet = await profile.walletFactory().fromSecret({
			coin: "ARK",
			network: ARKDevnet,
			secret: "secret",
		});

		const isSecondSignatureMock = jest.spyOn(wallet, "isSecondSignature").mockReturnValue(false);

		const { form, asFragment } = renderWithForm(<AuthenticationStep subject={subject} wallet={wallet} />, {
			withProviders: true,
		});

		await waitFor(() => expect(screen.queryByTestId(secondMnemonicID)).toBeNull());

		expect(screen.getByTestId("AuthenticationStep__secret")).toBeInTheDocument();

		userEvent.paste(screen.getByTestId("AuthenticationStep__secret"), "secret");

		await waitFor(() => expect(form()?.getValues()).toStrictEqual({ secret: "secret" }));

		expect(asFragment()).toMatchSnapshot();

		isSecondSignatureMock.mockRestore();
	});

	it("should request mnemonic if wallet was imported using address", async () => {
		wallet = await profile.walletFactory().fromAddress({
			address: "DJpFwW39QnQvQRQJF2MCfAoKvsX4DJ28jq",
			coin: "ARK",
			network: ARKDevnet,
		});

		const isSecondSignatureMock = jest.spyOn(wallet, "isSecondSignature").mockReturnValue(false);

		const { form, asFragment } = renderWithForm(<AuthenticationStep subject={subject} wallet={wallet} />, {
			withProviders: true,
		});

		await waitFor(() => expect(screen.queryByTestId(secondMnemonicID)).toBeNull());

		expect(screen.getByTestId("AuthenticationStep__mnemonic")).toBeInTheDocument();

		userEvent.paste(screen.getByTestId("AuthenticationStep__mnemonic"), MNEMONICS[0]);

		await waitFor(() => expect(form()?.getValues()).toStrictEqual({ mnemonic: MNEMONICS[0] }));

		expect(asFragment()).toMatchSnapshot();

		isSecondSignatureMock.mockRestore();
	});

	it("should request private key if wallet was imported using private key", async () => {
		wallet = await profile.walletFactory().fromPrivateKey({
			coin: "ARK",
			network: ARKDevnet,
			privateKey: "d8839c2432bfd0a67ef10a804ba991eabba19f154a3d707917681d45822a5712",
		});

		jest.spyOn(wallet, "isSecondSignature").mockReturnValueOnce(false);

		const { asFragment } = renderWithForm(<AuthenticationStep subject={subject} wallet={wallet} />, {
			withProviders: true,
		});

		await waitFor(() => expect(screen.queryByTestId(secondMnemonicID)).toBeNull());

		expect(screen.getByTestId("AuthenticationStep__private-key")).toBeInTheDocument();
		expect(asFragment()).toMatchSnapshot();
	});

	it("should request WIF if wallet was imported using WIF", async () => {
		wallet = await profile.walletFactory().fromWIF({
			coin: "ARK",
			network: ARKDevnet,
			wif: "SGq4xLgZKCGxs7bjmwnBrWcT4C1ADFEermj846KC97FSv1WFD1dA",
		});

		jest.spyOn(wallet, "isSecondSignature").mockReturnValueOnce(false);

		const { asFragment } = renderWithForm(<AuthenticationStep subject={subject} wallet={wallet} />, {
			withProviders: true,
		});

		await waitFor(() => expect(screen.queryByTestId(secondMnemonicID)).toBeNull());

		expect(screen.getByTestId("AuthenticationStep__wif")).toBeInTheDocument();
		expect(asFragment()).toMatchSnapshot();
	});

	itif(subject === "transaction")("should request mnemonic and second mnemonic", async () => {
		await wallet.synchroniser().identity();
		const secondSignatureMock = jest.spyOn(wallet, "isSecondSignature").mockReturnValue(true);

		const { form, asFragment } = renderWithForm(<AuthenticationStep subject={subject} wallet={wallet} />, {
			withProviders: true,
		});

		await expect(screen.findByTestId("AuthenticationStep__mnemonic")).resolves.toBeVisible();
		await expect(screen.findByTestId(secondMnemonicID)).resolves.toBeVisible();

		userEvent.paste(screen.getByTestId("AuthenticationStep__mnemonic"), getDefaultWalletMnemonic());

		await waitFor(() => {
			expect(screen.getByTestId(secondMnemonicID)).toBeEnabled();
		});

		userEvent.paste(screen.getByTestId(secondMnemonicID), MNEMONICS[1]);

		await waitFor(() =>
			expect(form()?.getValues()).toStrictEqual({
				mnemonic: getDefaultWalletMnemonic(),
				secondMnemonic: MNEMONICS[1],
			}),
		);

		expect(asFragment()).toMatchSnapshot();

		secondSignatureMock.mockRestore();
	});

	itif(subject === "transaction")("should request secret and second secret", async () => {
		wallet = await profile.walletFactory().fromSecret({
			coin: "ARK",
			network: ARKDevnet,
			secret: "abc",
		});

		const { form, asFragment } = renderWithForm(<AuthenticationStep subject={subject} wallet={wallet} />, {
			withProviders: true,
		});

		await expect(screen.findByTestId("AuthenticationStep__secret")).resolves.toBeVisible();
		await expect(screen.findByTestId(secondSecretID)).resolves.toBeVisible();

		userEvent.paste(screen.getByTestId("AuthenticationStep__secret"), "abc");

		await waitFor(() => {
			expect(screen.getByTestId(secondSecretID)).toBeEnabled();
		});

		userEvent.paste(screen.getByTestId(secondSecretID), "abc");

		await waitFor(() =>
			expect(form()?.getValues()).toStrictEqual({
				secondSecret: "abc",
				secret: "abc",
			}),
		);

		expect(asFragment()).toMatchSnapshot();
	});

	it("should show only ledger confirmation", async () => {
		mockNanoXTransport();
		jest.spyOn(wallet, "isLedger").mockReturnValueOnce(true);

		const { asFragment } = renderWithForm(<AuthenticationStep subject={subject} wallet={wallet} />, {
			withProviders: true,
		});

		await expect(screen.findByTestId("LedgerConfirmation-description")).resolves.toBeVisible();

		await waitFor(() => expect(screen.queryByTestId("AuthenticationStep__mnemonic")).toBeNull());
		await waitFor(() => expect(screen.queryByTestId(secondMnemonicID)).toBeNull());

		expect(asFragment()).toMatchSnapshot();

		jest.clearAllMocks();
	});

	it("should specify ledger supported model", async () => {
		mockNanoXTransport();
		jest.spyOn(wallet, "isLedger").mockReturnValueOnce(true);

		const { asFragment } = renderWithForm(
			<AuthenticationStep
				subject={subject}
				ledgerIsAwaitingApp={false}
				ledgerIsAwaitingDevice={true}
				ledgerConnectedModel={Contracts.WalletLedgerModel.NanoS}
				ledgerSupportedModels={[Contracts.WalletLedgerModel.NanoX]}
				wallet={wallet}
			/>,
			{
				withProviders: true,
			},
		);

		await waitFor(() => expect(screen.queryByTestId("AuthenticationStep__mnemonic")).toBeNull());

		expect(screen.queryByTestId(secondMnemonicID)).toBeNull();
		expect(asFragment()).toMatchSnapshot();

		jest.clearAllMocks();
	});

	it("should show ledger waiting device screen", async () => {
		mockNanoXTransport();
		jest.spyOn(wallet, "isLedger").mockReturnValueOnce(true);

		const { asFragment } = renderWithForm(
			<AuthenticationStep subject={subject} wallet={wallet} ledgerIsAwaitingDevice={true} />,
			{
				withProviders: true,
			},
		);

		// eslint-disable-next-line testing-library/prefer-explicit-assert
		await screen.findByTestId("LedgerWaitingDevice-loading_message");

		expect(asFragment()).toMatchSnapshot();

		jest.restoreAllMocks();
	});

	it("should show ledger waiting device screen for Nano X", async () => {
		mockNanoXTransport();
		jest.spyOn(wallet, "isLedger").mockReturnValueOnce(true);

		const { asFragment } = renderWithForm(
			<AuthenticationStep
				subject={subject}
				ledgerIsAwaitingDevice={false}
				ledgerIsAwaitingApp={false}
				ledgerSupportedModels={[Contracts.WalletLedgerModel.NanoX]}
				wallet={wallet}
			/>,
			{
				withProviders: true,
			},
		);

		await expect(screen.findByTestId("LedgerConfirmation-description")).resolves.toBeVisible();

		expect(asFragment()).toMatchSnapshot();

		jest.restoreAllMocks();
	});

	it("should show ledger waiting device screen for Nano S", async () => {
		mockNanoSTransport();
		jest.spyOn(wallet, "isLedger").mockReturnValueOnce(true);

		const { asFragment } = renderWithForm(
			<AuthenticationStep
				subject={subject}
				ledgerIsAwaitingDevice={false}
				ledgerIsAwaitingApp={false}
				ledgerSupportedModels={[Contracts.WalletLedgerModel.NanoS]}
				wallet={wallet}
			/>,
			{
				withProviders: true,
			},
		);

		await expect(screen.findByTestId("LedgerConfirmation-description")).resolves.toBeVisible();

		expect(asFragment()).toMatchSnapshot();

		jest.restoreAllMocks();
	});

	it("should show ledger waiting app screen", async () => {
		mockNanoXTransport();
		jest.spyOn(wallet, "isLedger").mockReturnValueOnce(true);

		const { asFragment } = renderWithForm(
			<AuthenticationStep
				subject={subject}
				ledgerIsAwaitingDevice={false}
				ledgerIsAwaitingApp={true}
				ledgerSupportedModels={[Contracts.WalletLedgerModel.NanoX]}
				wallet={wallet}
			/>,
			{
				withProviders: true,
			},
		);

		// eslint-disable-next-line testing-library/prefer-explicit-assert
		await screen.findByTestId("LedgerWaitingApp-loading_message");

		expect(asFragment()).toMatchSnapshot();

		jest.clearAllMocks();
	});

	it("should handle ledger error", async () => {
		mockLedgerTransportError("Access denied to use Ledger device");

		jest.spyOn(wallet, "isLedger").mockReturnValueOnce(true);

		renderWithForm(<AuthenticationStep subject={subject} wallet={wallet} />, {
			withProviders: true,
		});

		await waitFor(() => expect(goMock).toHaveBeenCalledWith(-1));

		jest.clearAllMocks();
	});

	it("should render with encryption password input", async () => {
		mockNanoXTransport();
		jest.spyOn(wallet, "actsWithMnemonic").mockReturnValue(false);
		jest.spyOn(wallet, "actsWithWifWithEncryption").mockReturnValue(true);
		jest.spyOn(wallet.signingKey(), "get").mockReturnValue(PBKDF2.encrypt(getDefaultWalletMnemonic(), "password"));

		renderWithForm(<AuthenticationStep subject={subject} wallet={wallet} />, { withProviders: true });

		await expect(screen.findByTestId("AuthenticationStep__encryption-password")).resolves.toBeVisible();

		jest.clearAllMocks();
	});
});
